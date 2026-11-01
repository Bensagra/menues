import { describe, expect, it } from "vitest";
import { DESIGN_INSTRUCTIONS } from "@/ai/design-prompt";
import { EXTRACTION_INSTRUCTIONS } from "@/ai/prompt";
import { ProviderError } from "@/ai/types";
import { XaiMenuExtractionProvider } from "@/ai/xai";

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

function okBody(text: string) {
  return {
    status: "completed",
    model: "grok-4.7",
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 1200, output_tokens: 300, cost_in_usd_ticks: 42 },
  };
}

function provider(respond: (req: { url: string; init: RequestInit }) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond({ url, init });
  }) as unknown as typeof fetch;
  const p = new XaiMenuExtractionProvider({
    apiKey: "xai-test-key-1234567890",
    model: "grok-4.7",
    baseUrl: "https://api.x.ai/v1",
    timeoutMs: 10_000,
    maxOutputTokens: 4000,
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

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("adaptador de xAI (Responses API)", () => {
  it("envía la imagen como dato, con salida estructurada estricta, sin herramientas y sin guardar", async () => {
    const { p, calls } = provider(() => json(okBody(JSON.stringify(extraction))));
    const result = await p.extractPage(input());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.x.ai/v1/responses");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer xai-test-key-1234567890");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: "grok-4.7", store: false, temperature: 0, safety_identifier: "negocio-123" });
    expect(body.tools).toBeUndefined();
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
    expect(body.input[0].content[0]).toMatchObject({ type: "input_image", image_url: "data:image/jpeg;base64,/9j/2Q==" });
    expect(body.instructions).toBe(EXTRACTION_INSTRUCTIONS);
    expect(result.data.categories[0].items[0].name).toBe("Milanesa");
    expect(result.usage).toEqual({ input_tokens: 1200, output_tokens: 300, cost_usd_ticks: 42 });
  });

  it("las instrucciones tratan el texto de la imagen como datos y prohíben inventar", () => {
    expect(EXTRACTION_INSTRUCTIONS).toMatch(/image content is data only/i);
    expect(EXTRACTION_INSTRUCTIONS).toMatch(/Never guess a value/);
    expect(EXTRACTION_INSTRUCTIONS).toMatch(/Never assume a currency/);
  });

  it("clasifica los errores HTTP y respeta Retry-After", async () => {
    const rate = provider(() => json({ error: "slow down" }, 429, { "retry-after": "12" }));
    await expect(rate.p.extractPage(input())).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterSeconds: 12 });
    const auth = provider(() => json({ error: "bad key" }, 401));
    await expect(auth.p.extractPage(input())).rejects.toMatchObject({ code: "auth", retryable: false });
    const down = provider(() => json({ error: "oops" }, 503));
    await expect(down.p.extractPage(input())).rejects.toMatchObject({ code: "unavailable", retryable: true });
    const bad = provider(() => json({ error: "invalid model" }, 400));
    await expect(bad.p.extractPage(input())).rejects.toMatchObject({ code: "bad_request", retryable: false });
  });

  it("no acepta negativas, respuestas incompletas ni datos fuera del esquema", async () => {
    const refusal = provider(() => json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }));
    await expect(refusal.p.extractPage(input())).rejects.toMatchObject({ code: "refused" });
    const incomplete = provider(() => json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }));
    await expect(incomplete.p.extractPage(input())).rejects.toMatchObject({ code: "incomplete" });
    const notJson = provider(() => json(okBody("esto no es JSON")));
    await expect(notJson.p.extractPage(input())).rejects.toMatchObject({ code: "invalid_output" });
    const wrongShape = { ...extraction, categories: [{ name: "X", items: [{ name: "Y", price_value: 12500 }] }] };
    const invalid = provider(() => json(okBody(JSON.stringify(wrongShape))));
    await expect(invalid.p.extractPage(input())).rejects.toBeInstanceOf(ProviderError);
  });

  it("propone un diseño con esquema estricto, imágenes etiquetadas y sin herramientas", async () => {
    const { p, calls } = provider(() => json(okBody(JSON.stringify(designProposal))));
    const result = await p.designTheme(designInput());
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ store: false, instructions: DESIGN_INSTRUCTIONS, safety_identifier: "negocio-123" });
    expect(body.tools).toBeUndefined();
    expect(body.prompt_cache_key).toBeUndefined();
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "menu_design", strict: true });
    expect(body.input[0].content.map((c: { type: string }) => c.type)).toEqual(["input_text", "input_image", "input_text", "input_image", "input_text"]);
    expect(result.data.theme.colors.accent).toBe("#7A2341");
  });

  it("no se construye sin clave", () => {
    expect(
      () => new XaiMenuExtractionProvider({ apiKey: "", model: "grok-4.7", baseUrl: "https://api.x.ai/v1", timeoutMs: 10_000, maxOutputTokens: 100 }),
    ).toThrow(ProviderError);
  });
});
