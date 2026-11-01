import { DESIGN_JSON_SCHEMA, parseDesignProposal } from "@/domain/design-proposal";
import { PAGE_EXTRACTION_JSON_SCHEMA, parsePageExtraction } from "@/domain/extraction";
import { DESIGN_INSTRUCTIONS, designContextText } from "./design-prompt";
import { EXTRACTION_INSTRUCTIONS, pageUserText } from "./prompt";
import {
  ProviderError,
  retryAfterSeconds,
  type DesignThemeInput,
  type DesignThemeResult,
  type ExtractPageInput,
  type ExtractPageResult,
  type MenuExtractionProvider,
} from "./types";

// Adaptador de la Gemini API de Google (POST {base}/models/{modelo}:generateContent).
// Documentación consultada: ai.google.dev › API reference (generateContent),
// Structured output e Image understanding (noviembre de 2026), y pruebas reales
// contra la API.
//  * Imágenes: partes "inlineData" en base64, JPG/PNG; el pedido completo hasta 20 MB.
//  * Salida estructurada: generationConfig.responseMimeType = "application/json" y
//    responseJsonSchema. Gemini rechaza con 400 los esquemas con muchos maxItems
//    anidados, así que se envían sin ellos: los límites los controla parsePageExtraction.
//  * store: false. Sin herramientas.
//  * La clave va en el encabezado x-goog-api-key, nunca en la URL.
//  * 429 = cuota (RetryInfo indica la espera); 503 = demanda alta, se reintenta.
//  * El nivel gratuito tiene un cupo diario por modelo (20 pedidos en noviembre
//    de 2026): si se agota, se prueba con los modelos de respaldo y, si se
//    agotan todos, se informa sin reintentar hasta el día siguiente.

export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Modelos a usar, en orden, cuando se agota el cupo diario del principal. */
  fallbackModels?: string[];
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
  thinkingLevel?: GeminiThinkingLevel;
  fetchImpl?: typeof fetch;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiBody {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

interface GeminiError {
  error?: {
    message?: string;
    status?: string;
    details?: { "@type"?: string; reason?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[];
  };
}

const REFUSED = new Set([
  "SAFETY",
  "RECITATION",
  "LANGUAGE",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
]);
const INCOMPLETE = new Set(["MAX_TOKENS", "CONTINUATION"]);
const FINISHED = new Set(["STOP", "FINISH_REASON_UNSPECIFIED"]);

function withoutKey(value: unknown, key: string): unknown {
  if (Array.isArray(value)) return value.map((v) => withoutKey(v, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== key)
      // Dentro de "properties" las claves son nombres de campos, no palabras del esquema.
      .map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, withoutKey(s, key)])) : withoutKey(v, key)]),
  );
}

export const GEMINI_RESPONSE_SCHEMA = withoutKey(PAGE_EXTRACTION_JSON_SCHEMA, "maxItems");

async function readError(response: Response): Promise<{ detail: string; reasons: string[]; retryDelay?: number; dailyQuota: boolean }> {
  const raw = await response.text().catch(() => "");
  try {
    const body = JSON.parse(raw) as GeminiError;
    const details = body.error?.details ?? [];
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    const quotaIds = details.flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "");
    return {
      detail: (body.error?.message ?? "").slice(0, 300).replace(/\s+/g, " "),
      reasons: [body.error?.status, ...details.map((d) => d.reason)].filter((r): r is string => Boolean(r)),
      retryDelay: delay ? retryAfterSeconds(delay.replace(/s$/, "")) : undefined,
      dailyQuota: quotaIds.some((id) => /PerDay/i.test(id)) || /per day/i.test(body.error?.message ?? ""),
    };
  } catch {
    return { detail: raw.slice(0, 300).replace(/\s+/g, " "), reasons: [], dailyQuota: false };
  }
}

interface GeminiCall {
  instructions: string;
  parts: unknown[];
  schema: unknown;
  signal: AbortSignal;
}

export class GeminiMenuExtractionProvider implements MenuExtractionProvider {
  readonly name = "gemini" as const;
  readonly simulated = false;
  readonly model: string;

  constructor(private readonly config: GeminiConfig) {
    if (!config.apiKey) throw new ProviderError("not_configured", "Falta GEMINI_API_KEY");
    this.model = config.model;
  }

  async extractPage(input: ExtractPageInput): Promise<ExtractPageResult> {
    const { parsed, json } = await this.generate({
      instructions: EXTRACTION_INSTRUCTIONS,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.image.toString("base64") } },
        { text: pageUserText(input.pageNumber, input.pageCount) },
      ],
      schema: GEMINI_RESPONSE_SCHEMA,
      signal: input.signal,
    });
    const validated = parsePageExtraction(parsed);
    if (!validated.ok) throw new ProviderError("invalid_output", `La respuesta no respeta la estructura esperada: ${validated.error}`);
    return { data: validated.data, model: json.modelVersion ?? this.model, usage: usageOf(json) };
  }

  async designTheme(input: DesignThemeInput): Promise<DesignThemeResult> {
    // Cada imagen va precedida de su etiqueta para que el modelo sepa qué es.
    const parts = input.images.flatMap((image, i) => [
      { text: `Image ${i + 1}: ${image.label}` },
      { inlineData: { mimeType: image.mimeType, data: image.image.toString("base64") } },
    ]);
    parts.push({ text: designContextText(input.context, input.images.map((image) => image.label)) });
    const { parsed, json } = await this.generate({ instructions: DESIGN_INSTRUCTIONS, parts, schema: DESIGN_JSON_SCHEMA, signal: input.signal });
    const validated = parseDesignProposal(parsed);
    if (!validated.ok) throw new ProviderError("invalid_output", `La respuesta no respeta la estructura esperada: ${validated.error}`);
    return { data: validated.data, model: json.modelVersion ?? this.model, usage: usageOf(json) };
  }

  private async generate(call: GeminiCall): Promise<{ parsed: unknown; json: GeminiBody }> {
    const models = [this.config.model, ...(this.config.fallbackModels ?? [])];
    for (let i = 0; ; i++) {
      try {
        return await this.generateWith(models[i], call);
      } catch (error) {
        const exhausted = error instanceof ProviderError && error.code === "quota_exhausted";
        if (!exhausted || i === models.length - 1) throw error;
      }
    }
  }

  private async generateWith(model: string, call: GeminiCall): Promise<{ parsed: unknown; json: GeminiBody }> {
    // Sin temperature: para los modelos Gemini 3 Google recomienda dejar el valor
    // por defecto (bajarlo puede provocar repeticiones).
    const body = {
      systemInstruction: { parts: [{ text: call.instructions }] },
      contents: [{ role: "user", parts: call.parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: call.schema,
        maxOutputTokens: this.config.maxOutputTokens,
        mediaResolution: "MEDIA_RESOLUTION_HIGH",
        ...(this.config.thinkingLevel ? { thinkingConfig: { thinkingLevel: this.config.thinkingLevel } } : {}),
      },
      store: false,
    };

    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = AbortSignal.any([call.signal, timeout]);
    const doFetch = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await doFetch(`${this.config.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (timeout.aborted) throw new ProviderError("timeout", `Sin respuesta del proveedor en ${Math.round(this.config.timeoutMs / 1000)} s`);
      if (call.signal.aborted) throw new ProviderError("network", "Procesamiento cancelado");
      throw new ProviderError("network", `No se pudo conectar con el proveedor (${(error as Error).name})`);
    }

    if (!response.ok) {
      const status = response.status;
      const { detail, reasons, retryDelay, dailyQuota } = await readError(response);
      const header = retryAfterSeconds(response.headers.get("retry-after"));
      if (status === 429 && dailyQuota) throw new ProviderError("quota_exhausted", `Se agotó el cupo diario del modelo ${model}`, retryDelay, status);
      if (status === 429) throw new ProviderError("rate_limited", "El proveedor limitó la cantidad de pedidos", retryDelay ?? header ?? 60, status);
      // Google responde 400 (API_KEY_INVALID) ante una clave inválida.
      if (status === 401 || status === 403 || reasons.includes("API_KEY_INVALID")) {
        throw new ProviderError("auth", `El proveedor rechazó la credencial (HTTP ${status})`, undefined, status);
      }
      if (status >= 500) throw new ProviderError("unavailable", `El proveedor no está disponible (HTTP ${status})`, retryDelay ?? header, status);
      throw new ProviderError("bad_request", `El proveedor rechazó el pedido (HTTP ${status}): ${detail}`, undefined, status);
    }

    let json: GeminiBody;
    try {
      json = (await response.json()) as GeminiBody;
    } catch {
      throw new ProviderError("invalid_output", "La respuesta del proveedor no es JSON");
    }
    if (json.promptFeedback?.blockReason) throw new ProviderError("refused", "El modelo se negó a procesar la imagen");

    const candidate = json.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish && REFUSED.has(finish)) throw new ProviderError("refused", "El modelo se negó a procesar la imagen");
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (!candidate || (finish && INCOMPLETE.has(finish)) || !text) {
      throw new ProviderError("incomplete", `Respuesta incompleta${finish ? ` (${finish})` : ""}`);
    }
    if (finish && !FINISHED.has(finish)) throw new ProviderError("invalid_output", `El modelo terminó de forma inesperada (${finish})`);

    try {
      return { parsed: JSON.parse(text), json };
    } catch {
      throw new ProviderError("invalid_output", "El modelo no devolvió JSON válido");
    }
  }
}

function usageOf(json: GeminiBody) {
  const usage = json.usageMetadata;
  return {
    input_tokens: usage?.promptTokenCount ?? 0,
    // Los tokens de razonamiento se facturan como salida.
    output_tokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    // Gemini no informa el costo en la respuesta.
    cost_usd_ticks: 0,
  };
}
