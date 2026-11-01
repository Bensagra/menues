import { describe, expect, it } from "vitest";
import { GEMINI_RESPONSE_SCHEMA, GeminiMenuExtractionProvider } from "@/ai/gemini";
import { EXTRACTION_INSTRUCTIONS } from "@/ai/prompt";
import { ProviderError } from "@/ai/types";
import { aiStatus, type ServerEnv } from "@/lib/env";

const extraction = {
  page_readable: true,
  page_notes: null,
  currency_text: "$",
  categories: [
    {
      name: "Principales",
      items: [{ name: "Milanesa", description: null, price_text: "$ 12.500", price_value: "12500", variants: [], illegible_fields: [] }],
    },
  ],
};

function okBody(text: string, finishReason = "STOP") {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
    usageMetadata: { promptTokenCount: 1527, candidatesTokenCount: 219, thoughtsTokenCount: 965, totalTokenCount: 2711 },
    modelVersion: "gemini-3.6-flash",
  };
}

function provider(respond: (req: { url: string; init: RequestInit }) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond({ url, init });
  }) as unknown as typeof fetch;
  const p = new GeminiMenuExtractionProvider({
    apiKey: "AIza-test-key-1234567890",
    model: "gemini-3.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    timeoutMs: 10_000,
    maxOutputTokens: 32_000,
    fetchImpl,
  });
  return { p, calls };
}

const input = () => ({
  image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  mimeType: "image/jpeg" as const,
  pageNumber: 1,
  pageCount: 2,
  safetyIdentifier: "negocio-123",
  cacheKey: "cartalista-import-abc",
  signal: new AbortController().signal,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const googleError = (status: number, code: string, details: unknown[] = []) => ({ error: { code: status, message: "detalle", status: code, details } });

describe("adaptador de Gemini (generateContent)", () => {
  it("envía la imagen como dato, con esquema JSON, sin herramientas, sin guardar y con la clave en el encabezado", async () => {
    const { p, calls } = provider(() => json(okBody(JSON.stringify(extraction))));
    const result = await p.extractPage(input());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
    expect(calls[0].url).not.toContain("key=");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test-key-1234567890");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.systemInstruction.parts[0].text).toBe(EXTRACTION_INSTRUCTIONS);
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "/9j/2Q==" } });
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", maxOutputTokens: 32_000 });
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    expect(result.data.categories[0].items[0].name).toBe("Milanesa");
    expect(result.model).toBe("gemini-3.6-flash");
    expect(result.usage).toEqual({ input_tokens: 1527, output_tokens: 219 + 965, cost_usd_ticks: 0 });
  });

  it("manda el esquema sin maxItems (Gemini rechaza los anidados) y conserva el resto", () => {
    const text = JSON.stringify(GEMINI_RESPONSE_SCHEMA);
    expect(text).not.toContain("maxItems");
    expect(text).toContain('"additionalProperties":false');
    expect(text).toContain('"pattern"');
    // Un campo de datos llamado igual que una palabra del esquema no se borra.
    const schema = GEMINI_RESPONSE_SCHEMA as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["page_readable", "page_notes", "currency_text", "categories"]);
  });

  it("ignora las partes de razonamiento y usa el nivel configurado", async () => {
    const calls: RequestInit[] = [];
    const p = new GeminiMenuExtractionProvider({
      apiKey: "k",
      model: "gemini-3.5-flash",
      baseUrl: "https://example.test",
      timeoutMs: 10_000,
      maxOutputTokens: 1000,
      thinkingLevel: "low",
      fetchImpl: (async (_url: string, init: RequestInit) => {
        calls.push(init);
        return json({ candidates: [{ content: { parts: [{ text: "pensando…", thought: true }, { text: JSON.stringify(extraction) }] }, finishReason: "STOP" }] });
      }) as unknown as typeof fetch,
    });
    const result = await p.extractPage(input());
    expect(result.data.currency_text).toBe("$");
    expect(JSON.parse(String(calls[0].body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("clasifica los errores de Google y respeta RetryInfo", async () => {
    const quota = provider(() => json(googleError(429, "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "41s" }]), 429));
    await expect(quota.p.extractPage(input())).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterSeconds: 41 });
    const badKey = provider(() => json(googleError(400, "INVALID_ARGUMENT", [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]), 400));
    await expect(badKey.p.extractPage(input())).rejects.toMatchObject({ code: "auth", retryable: false });
    const denied = provider(() => json(googleError(403, "PERMISSION_DENIED"), 403));
    await expect(denied.p.extractPage(input())).rejects.toMatchObject({ code: "auth", retryable: false });
    const busy = provider(() => json(googleError(503, "UNAVAILABLE"), 503));
    await expect(busy.p.extractPage(input())).rejects.toMatchObject({ code: "unavailable", retryable: true });
    const noModel = provider(() => json(googleError(404, "NOT_FOUND"), 404));
    await expect(noModel.p.extractPage(input())).rejects.toMatchObject({ code: "bad_request", retryable: false });
  });

  it("no acepta bloqueos, respuestas cortadas ni datos fuera del esquema", async () => {
    const blocked = provider(() => json({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }));
    await expect(blocked.p.extractPage(input())).rejects.toMatchObject({ code: "refused" });
    const safety = provider(() => json(okBody("{}", "SAFETY")));
    await expect(safety.p.extractPage(input())).rejects.toMatchObject({ code: "refused" });
    const cut = provider(() => json(okBody('{"page_readable":', "MAX_TOKENS")));
    await expect(cut.p.extractPage(input())).rejects.toMatchObject({ code: "incomplete", retryable: true });
    const empty = provider(() => json({ candidates: [] }));
    await expect(empty.p.extractPage(input())).rejects.toMatchObject({ code: "incomplete" });
    const notJson = provider(() => json(okBody("esto no es JSON")));
    await expect(notJson.p.extractPage(input())).rejects.toMatchObject({ code: "invalid_output" });
    const wrongShape = { ...extraction, categories: [{ name: "X", items: [{ name: "Y", price_value: 12500 }] }] };
    const invalid = provider(() => json(okBody(JSON.stringify(wrongShape))));
    await expect(invalid.p.extractPage(input())).rejects.toBeInstanceOf(ProviderError);
    // Sin maxItems en el esquema, los límites se siguen aplicando al validar.
    const tooMany = { ...extraction, categories: Array.from({ length: 61 }, () => extraction.categories[0]) };
    const huge = provider(() => json(okBody(JSON.stringify(tooMany))));
    await expect(huge.p.extractPage(input())).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("no se construye sin clave", () => {
    expect(
      () => new GeminiMenuExtractionProvider({ apiKey: "", model: "gemini-3.5-flash", baseUrl: "https://example.test", timeoutMs: 10_000, maxOutputTokens: 100 }),
    ).toThrow(ProviderError);
  });

  it("AI_PROVIDER=gemini es un proveedor real y necesita su propia clave", () => {
    const env = (ai: Partial<ServerEnv["ai"]>) => ({ nodeEnv: "production", ai: { provider: "gemini", allowMock: false, geminiModel: "gemini-3.5-flash", ...ai } }) as ServerEnv;
    expect(aiStatus(env({ geminiApiKey: "k" }))).toEqual({ configured: true, provider: "gemini", model: "gemini-3.5-flash", simulated: false });
    expect(aiStatus(env({ xaiApiKey: "xai-k" }))).toEqual({ configured: false, provider: "gemini", reason: "missing_api_key" });
  });
});
