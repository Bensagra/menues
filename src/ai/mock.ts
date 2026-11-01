import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parsePageExtraction, type PageExtraction } from "@/domain/extraction";
import { ProviderError, type ExtractPageInput, type ExtractPageResult, type MenuExtractionProvider } from "./types";

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
}
