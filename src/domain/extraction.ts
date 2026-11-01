import { z } from "zod";
import { cleanText } from "./text";

// Estructura que se le pide al modelo por cada página. El JSON Schema se envía
// como salida estructurada estricta; la respuesta se vuelve a validar acá con
// Zod. Que el JSON sea válido no significa que los datos sean correctos: los
// precios se reinterpretan y se marcan las ambigüedades en el motor de
// comparación.

export const ILLEGIBLE_FIELDS = ["name", "description", "price", "variants"] as const;

const PRICE_VALUE_PATTERN = "[0-9]{1,9}([.][0-9]{1,2})?";
const priceValueRegex = new RegExp(`^${PRICE_VALUE_PATTERN}$`);

const nullableString = (maxLength: number, description: string) => ({
  type: ["string", "null"],
  maxLength,
  description,
});

const priceTextJson = nullableString(40, "El precio exactamente como está impreso (por ejemplo \"$ 12.500\"). null si no hay precio o no se lee.");
const priceValueJson = {
  type: ["string", "null"],
  pattern: PRICE_VALUE_PATTERN,
  description: "El mismo precio como número decimal con punto, sin símbolo ni separador de miles (por ejemplo \"12500\"). null si no es inequívoco.",
};

/** JSON Schema para `text.format` (json_schema, strict) de la Responses API de xAI. */
export const PAGE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["page_readable", "page_notes", "currency_text", "categories"],
  properties: {
    page_readable: {
      type: "boolean",
      description: "false si la imagen no es una carta o no se puede leer.",
    },
    page_notes: nullableString(300, "Observaciones breves sobre problemas de lectura de la página, o null."),
    currency_text: nullableString(10, "Símbolo o código de moneda impreso en la carta, si aparece. null si no aparece."),
    categories: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "items"],
        properties: {
          name: nullableString(120, "Título de la sección tal como está impreso, o null si los productos no tienen sección."),
          items: {
            type: "array",
            maxItems: 200,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "price_text", "price_value", "variants", "illegible_fields"],
              properties: {
                name: nullableString(160, "Nombre del producto tal como está impreso. null si no se lee."),
                description: nullableString(600, "Descripción impresa debajo o al lado del producto. null si no hay."),
                price_text: priceTextJson,
                price_value: priceValueJson,
                variants: {
                  type: "array",
                  maxItems: 12,
                  description: "Tamaños o presentaciones con precio propio (por ejemplo chica y grande). Vacío si no hay.",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "price_text", "price_value"],
                    properties: {
                      name: nullableString(60, "Nombre de la variante tal como está impreso."),
                      price_text: priceTextJson,
                      price_value: priceValueJson,
                    },
                  },
                },
                illegible_fields: {
                  type: "array",
                  maxItems: 4,
                  items: { type: "string", enum: [...ILLEGIBLE_FIELDS] },
                  description: "Campos que aparecen en la imagen pero no se pueden leer con seguridad.",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const textField = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullable()
    .transform((value) => cleanText(value, max));

const priceValueField = z
  .string()
  .nullable()
  .transform((value) => (value !== null && priceValueRegex.test(value.trim()) ? value.trim() : null));

const variantSchema = z.object({
  name: textField(60),
  price_text: textField(40),
  price_value: priceValueField,
});

const itemSchema = z.object({
  name: textField(160),
  description: textField(600),
  price_text: textField(40),
  price_value: priceValueField,
  variants: z.array(variantSchema).max(12),
  illegible_fields: z.array(z.enum(ILLEGIBLE_FIELDS)).max(4),
});

export const pageExtractionSchema = z.object({
  page_readable: z.boolean(),
  page_notes: textField(300),
  currency_text: textField(10),
  categories: z
    .array(
      z.object({
        name: textField(120),
        items: z.array(itemSchema).max(200),
      }),
    )
    .max(60),
});

export type PageExtraction = z.infer<typeof pageExtractionSchema>;
export type ExtractedItem = z.infer<typeof itemSchema>;

export function parsePageExtraction(value: unknown): { ok: true; data: PageExtraction } | { ok: false; error: string } {
  const result = pageExtractionSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, data: result.data };
}

export interface MergedItem extends ExtractedItem {
  page: number;
  categoryName: string | null;
}

export interface MergedExtraction {
  pages: { page: number; readable: boolean; notes: string | null; currencyText: string | null; itemCount: number }[];
  items: MergedItem[];
}

export function mergePageExtractions(pages: { page: number; data: PageExtraction }[]): MergedExtraction {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  return {
    pages: sorted.map(({ page, data }) => ({
      page,
      readable: data.page_readable,
      notes: data.page_notes,
      currencyText: data.currency_text,
      itemCount: data.categories.reduce((sum, c) => sum + c.items.length, 0),
    })),
    items: sorted.flatMap(({ page, data }) =>
      data.page_readable
        ? data.categories.flatMap((category) => category.items.map((item) => ({ ...item, page, categoryName: category.name })))
        : [],
    ),
  };
}
