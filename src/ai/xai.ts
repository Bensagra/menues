import { PAGE_EXTRACTION_JSON_SCHEMA, parsePageExtraction } from "@/domain/extraction";
import { EXTRACTION_INSTRUCTIONS, pageUserText } from "./prompt";
import { ProviderError, retryAfterSeconds as retryAfter, type ExtractPageInput, type ExtractPageResult, type MenuExtractionProvider } from "./types";

// Adaptador de la Responses API de xAI (POST {base}/responses).
// Documentación consultada: docs.x.ai › Responses, Image Understanding,
// Structured Outputs, Debugging Errors y Rate Limits (octubre de 2026).
//  * Imágenes: partes "input_image" con data URL base64, JPG/PNG, hasta 20 MiB.
//  * Salida estructurada: text.format = { type: "json_schema", name, schema, strict: true }.
//  * store: false (recomendado al enviar imágenes).
//  * 429 = rate limit (reintentar con backoff); 5xx = indisponibilidad.

export interface XaiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  fetchImpl?: typeof fetch;
}

interface ResponsesOutputItem {
  type?: string;
  content?: { type?: string; text?: string; refusal?: string }[];
}

interface ResponsesBody {
  status?: string;
  model?: string;
  output?: ResponsesOutputItem[];
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string; code?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number; cost_in_usd_ticks?: number | null };
}

export class XaiMenuExtractionProvider implements MenuExtractionProvider {
  readonly name = "xai" as const;
  readonly simulated = false;
  readonly model: string;

  constructor(private readonly config: XaiConfig) {
    if (!config.apiKey) throw new ProviderError("not_configured", "Falta XAI_API_KEY");
    this.model = config.model;
  }

  async extractPage(input: ExtractPageInput): Promise<ExtractPageResult> {
    const body = {
      model: this.config.model,
      store: false,
      instructions: EXTRACTION_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: `data:${input.mimeType};base64,${input.image.toString("base64")}`, detail: "high" },
            { type: "input_text", text: pageUserText(input.pageNumber, input.pageCount) },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "menu_page_extraction", schema: PAGE_EXTRACTION_JSON_SCHEMA, strict: true },
      },
      max_output_tokens: this.config.maxOutputTokens,
      temperature: 0,
      safety_identifier: input.safetyIdentifier,
      prompt_cache_key: input.cacheKey,
      ...(this.config.reasoningEffort ? { reasoning: { effort: this.config.reasoningEffort } } : {}),
    };

    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = AbortSignal.any([input.signal, timeout]);
    const doFetch = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${this.config.baseUrl}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (timeout.aborted) throw new ProviderError("timeout", `Sin respuesta del proveedor en ${Math.round(this.config.timeoutMs / 1000)} s`);
      if (input.signal.aborted) throw new ProviderError("network", "Procesamiento cancelado");
      throw new ProviderError("network", `No se pudo conectar con el proveedor (${(error as Error).name})`);
    }

    if (!response.ok) {
      const status = response.status;
      // El cuerpo del error puede describir el problema; nunca incluye la clave.
      const detail = (await response.text().catch(() => "")).slice(0, 300).replace(/\s+/g, " ");
      if (status === 429) throw new ProviderError("rate_limited", "El proveedor limitó la cantidad de pedidos", retryAfter(response.headers.get("retry-after")) ?? 60, status);
      if (status === 401 || status === 403) throw new ProviderError("auth", `El proveedor rechazó la credencial (HTTP ${status})`, undefined, status);
      if (status >= 500) throw new ProviderError("unavailable", `El proveedor no está disponible (HTTP ${status})`, retryAfter(response.headers.get("retry-after")), status);
      throw new ProviderError("bad_request", `El proveedor rechazó el pedido (HTTP ${status}): ${detail}`, undefined, status);
    }

    let json: ResponsesBody;
    try {
      json = (await response.json()) as ResponsesBody;
    } catch {
      throw new ProviderError("invalid_output", "La respuesta del proveedor no es JSON");
    }
    if (json.error?.message) throw new ProviderError("unavailable", `El proveedor informó un error: ${json.error.message.slice(0, 200)}`);

    const message = json.output?.find((item) => item.type === "message");
    const refusal = message?.content?.find((c) => c.type === "refusal");
    if (refusal) throw new ProviderError("refused", "El modelo se negó a procesar la imagen");
    const text = message?.content?.find((c) => c.type === "output_text")?.text;
    if (json.status === "incomplete" || !text) {
      throw new ProviderError("incomplete", `Respuesta incompleta${json.incomplete_details?.reason ? ` (${json.incomplete_details.reason})` : ""}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError("invalid_output", "El modelo no devolvió JSON válido");
    }
    const validated = parsePageExtraction(parsed);
    if (!validated.ok) throw new ProviderError("invalid_output", `La respuesta no respeta la estructura esperada: ${validated.error}`);

    return {
      data: validated.data,
      model: json.model ?? this.config.model,
      usage: {
        input_tokens: json.usage?.input_tokens ?? 0,
        output_tokens: json.usage?.output_tokens ?? 0,
        cost_usd_ticks: json.usage?.cost_in_usd_ticks ?? 0,
      },
    };
  }
}
