import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDesignProposal } from "@/domain/design-proposal";
import { parsePageExtraction, type PageExtraction } from "@/domain/extraction";
import {
  ProviderError,
  type DesignThemeInput,
  type DesignThemeResult,
  type ExtractPageInput,
  type ExtractPageResult,
  type MenuExtractionProvider,
} from "./types";

// Proveedor SIMULADO. Solo se habilita en pruebas (NODE_ENV=test) o en
// desarrollo con ALLOW_MOCK_AI=true. Sus resultados quedan registrados con
// provider = "mock" y la interfaz los marca como "Resultado simulado".
//
// Busca una respuesta fija por el SHA-256 de la imagen en MOCK_AI_FIXTURES_DIR
// (por defecto tests/fixtures/mock-ai). Archivos especiales para probar fallos:
//   <sha>.fail-<código>  → lanza ProviderError con ese código.
// Si no hay fixture, devuelve una carta de ejemplo genérica.

const DEFAULT: PageExtraction = {
  page_readable: true,
  page_notes: "Resultado simulado: no proviene de un modelo de IA.",
  currency_text: "$",
  categories: [
    {
      name: "Pizzas",
      items: [
        {
          name: "Muzzarella",
          description: null,
          price_text: null,
          price_value: null,
          variants: [
            { name: "Chica", price_text: "$ 12.500", price_value: "12500" },
            { name: "Grande", price_text: "$ 17.900", price_value: "17900" },
          ],
          illegible_fields: [],
        },
        { name: "Fugazzeta rellena", description: null, price_text: "$ 22.000", price_value: "22000", variants: [], illegible_fields: [] },
      ],
    },
    {
      name: "Postres",
      items: [
        { name: "Flan casero con dulce de leche", description: null, price_text: "$ 7.?00", price_value: null, variants: [], illegible_fields: ["price"] },
        { name: "Volcán de chocolate", description: "Con helado de crema.", price_text: "$ 9.500", price_value: "9500", variants: [], illegible_fields: [] },
      ],
    },
  ],
};

export class MockMenuExtractionProvider implements MenuExtractionProvider {
  readonly name = "mock" as const;
  readonly model = "mock";
  readonly simulated = true;

  constructor(private readonly fixturesDir = process.env.MOCK_AI_FIXTURES_DIR ?? path.join(process.cwd(), "tests/fixtures/mock-ai")) {}

  async extractPage(input: ExtractPageInput): Promise<ExtractPageResult> {
    const sha = input.sourceSha256 ?? createHash("sha256").update(input.image).digest("hex");
    const failure = ["timeout", "rate_limited", "unavailable", "invalid_output", "auth", "bad_request"].find((code) =>
      existsSync(path.join(this.fixturesDir, `${sha}.fail-${code}`)),
    );
    if (failure) throw new ProviderError(failure as never, `Falla simulada: ${failure}`, failure === "rate_limited" ? 1 : undefined);

    const file = path.join(this.fixturesDir, `${sha}.json`);
    let data: PageExtraction = DEFAULT;
    if (existsSync(file)) {
      const parsed = parsePageExtraction(JSON.parse(readFileSync(file, "utf8")));
      if (!parsed.ok) throw new ProviderError("invalid_output", `Fixture inválido: ${parsed.error}`);
      data = parsed.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (input.signal.aborted) throw new ProviderError("network", "Procesamiento cancelado");
    return { data, model: "mock", usage: { input_tokens: 0, output_tokens: 0, cost_usd_ticks: 0 } };
  }

  /** Elige una de las propuestas fijas según las referencias: mismas referencias, misma propuesta. */
  async designTheme(input: DesignThemeInput): Promise<DesignThemeResult> {
    const hash = createHash("sha256").update(input.context);
    for (const image of input.images) hash.update(image.image);
    const index = parseInt(hash.digest("hex").slice(0, 8), 16) % MOCK_DESIGNS.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (input.signal.aborted) throw new ProviderError("network", "Procesamiento cancelado");
    const parsed = parseDesignProposal(MOCK_DESIGNS[index]);
    if (!parsed.ok) throw new ProviderError("invalid_output", `Propuesta simulada inválida: ${parsed.error}`);
    return { data: parsed.data, model: "mock", usage: { input_tokens: 0, output_tokens: 0, cost_usd_ticks: 0 } };
  }
}

const MOCK_SUMMARY = "Propuesta simulada (modo de prueba): no proviene de un modelo de IA.";

const MOCK_DESIGNS = [
  {
    summary: MOCK_SUMMARY,
    colors: { background: "#F6F1E7", surface: "#FFFDF8", text: "#2A2420", muted: "#6B6158", accent: "#9A4128" },
    fonts: { display: "playfair", body: "dm_sans" },
    style: { header: "centered", categories: "caps", dividers: "dotted", corners: "soft" },
  },
  {
    summary: MOCK_SUMMARY,
    colors: { background: "#16181A", surface: "#202326", text: "#F2EFE9", muted: "#B9B4AA", accent: "#E8B44C" },
    fonts: { display: "bebas", body: "work_sans" },
    style: { header: "classic", categories: "band", dividers: "solid", corners: "square" },
  },
  {
    summary: MOCK_SUMMARY,
    colors: { background: "#EEF3EE", surface: "#FFFFFF", text: "#1D2A22", muted: "#56645B", accent: "#2E5E45" },
    fonts: { display: "caveat", body: "manrope" },
    style: { header: "classic", categories: "underline", dividers: "dashed", corners: "round" },
  },
];
