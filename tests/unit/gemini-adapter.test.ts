import { describe, expect, it } from "vitest";
import { GEMINI_RESPONSE_SCHEMA, GeminiMenuExtractionProvider } from "@/ai/gemini";
import { DESIGN_INSTRUCTIONS } from "@/ai/design-prompt";
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


const designProposal = {
  summary: "Tomé el bordó de tu logo.",
  colors: { background: "#F6F1E7", surface: "#FFFDF8", text: "#2A2420", muted: "#6B6158", accent: "#7A2341" },
  fonts: { display: "playfair", body: "dm_sans" },
  style: { header: "centered", categories: "caps", dividers: "dotted", corners: "soft" },
};

const designInput = () => ({
  images: [
    { label: "the restaurant's logo", image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/jpeg" as const },
    { label: "a photo of the restaurant's printed menu", image: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/jpeg" as const },
  ],
  context: "Restaurant name: La Esquina",
  safetyIdentifier: "negocio-123",
  signal: new AbortController().signal,
});

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

  it("propone un diseño: cada imagen con su etiqueta, sin herramientas y con la paleta corregida", async () => {
    const { p, calls } = provider(() => json(okBody(JSON.stringify({ ...designProposal, colors: { ...designProposal.colors, muted: "#F0EBE0" } }))));
    const result = await p.designTheme(designInput());
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.systemInstruction.parts[0].text).toBe(DESIGN_INSTRUCTIONS);
    expect(body.tools).toBeUndefined();
    expect(body.store).toBe(false);
    expect(body.contents[0].parts.map((part: { text?: string; inlineData?: unknown }) => (part.inlineData ? "imagen" : part.text?.split("\n")[0]))).toEqual([
      "Image 1: the restaurant's logo",
      "imagen",
      "Image 2: a photo of the restaurant's printed menu",
      "imagen",
      "Images attached, in order: 1. the restaurant's logo; 2. a photo of the restaurant's printed menu.",
    ]);
    expect(JSON.stringify(body.generationConfig.responseJsonSchema)).toContain('"bebas"');
    expect(result.data.summary).toBe("Tomé el bordó de tu logo.");
    // El texto secundario casi blanco se oscureció hasta leerse.
    expect(result.data.theme.colors.muted).not.toBe("#F0EBE0");
    expect(result.data.theme.fonts.display).toBe("playfair");
  });

  it("rechaza una propuesta fuera del esquema", async () => {
    const { p } = provider(() => json(okBody(JSON.stringify({ ...designProposal, fonts: { display: "comic", body: "dm_sans" } }))));
    await expect(p.designTheme(designInput())).rejects.toMatchObject({ code: "invalid_output", retryable: true });
  });

  it("si se agota el cupo diario de un modelo usa el siguiente, y si se agotan todos lo informa sin reintentar", async () => {
    const daily = () =>
      json(
        googleError(429, "RESOURCE_EXHAUSTED", [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "58169s" },
        ]),
        429,
      );
    const make = (respond: (url: string) => Response) => {
      const urls: string[] = [];
      const p = new GeminiMenuExtractionProvider({
        apiKey: "k",
        model: "gemini-3.5-flash",
        fallbackModels: ["gemini-3.8-flash"],
        baseUrl: "https://example.test",
        timeoutMs: 10_000,
        maxOutputTokens: 1000,
        fetchImpl: (async (url: string) => {
          urls.push(url);
          return respond(url);
        }) as unknown as typeof fetch,
      });
      return { p, urls };
    };

    const fallback = make((url) => (url.includes("gemini-3.5-flash") ? daily() : json({ ...okBody(JSON.stringify(extraction)), modelVersion: "gemini-3.8-flash" })));
    const result = await fallback.p.extractPage(input());
    expect(fallback.urls.map((u) => u.split("/models/")[1])).toEqual(["gemini-3.5-flash:generateContent", "gemini-3.8-flash:generateContent"]);
    expect(result.model).toBe("gemini-3.8-flash");

    const allSpent = make(() => daily());
    await expect(allSpent.p.extractPage(input())).rejects.toMatchObject({ code: "quota_exhausted", retryable: false });
    expect(allSpent.urls).toHaveLength(2);

    // Un límite por minuto no cambia de modelo: se reintenta más tarde.
    const perMinute = make(() => json(googleError(429, "RESOURCE_EXHAUSTED", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "20s" }]), 429));
    await expect(perMinute.p.extractPage(input())).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterSeconds: 20 });
    expect(perMinute.urls).toHaveLength(1);
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
