import { z } from "zod";
import {
  BODY_FONTS,
  CATEGORY_STYLES,
  CORNER_STYLES,
  DISPLAY_FONTS,
  DIVIDER_STYLES,
  HEADER_STYLES,
  fixTheme,
  themeSchema,
  type MenuTheme,
} from "./theme";
import { cleanText } from "./text";

// Propuesta de diseño que devuelve la IA: un diseño (de listas cerradas) y una
// explicación breve para el dueño. El JSON Schema se envía como salida
// estructurada; la respuesta se vuelve a validar acá y la paleta se corrige
// para que siempre cumpla contraste.

export const DESIGN_SOURCES = ["logo", "cover", "menu_photo", "website"] as const;
export type DesignSource = (typeof DESIGN_SOURCES)[number];

export const DESIGN_SOURCE_LABELS: Record<DesignSource, string> = {
  logo: "Logo",
  cover: "Foto del local",
  menu_photo: "Foto de la carta",
  website: "Sitio web",
};

const hexJson = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const enumJson = (values: object, description: string) => ({ type: "string", enum: Object.keys(values), description });

export const DESIGN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "colors", "fonts", "style"],
  properties: {
    summary: {
      type: "string",
      maxLength: 400,
      description: "1 a 3 oraciones en español rioplatense (voseo) para el dueño: qué tomaste de cada referencia.",
    },
    colors: {
      type: "object",
      additionalProperties: false,
      required: ["background", "surface", "text", "muted", "accent"],
      properties: {
        background: { ...hexJson, description: "Fondo de la página." },
        surface: { ...hexJson, description: "Tarjetas: cercano al fondo, apenas más claro u oscuro." },
        text: { ...hexJson, description: "Texto principal." },
        muted: { ...hexJson, description: "Texto secundario (descripciones)." },
        accent: { ...hexJson, description: "Color de marca: nombre del local y títulos de secciones." },
      },
    },
    fonts: {
      type: "object",
      additionalProperties: false,
      required: ["display", "body"],
      properties: {
        display: enumJson(DISPLAY_FONTS, "Tipografía del nombre del local y de los títulos."),
        body: enumJson(BODY_FONTS, "Tipografía del resto de los textos."),
      },
    },
    style: {
      type: "object",
      additionalProperties: false,
      required: ["header", "categories", "dividers", "corners"],
      properties: {
        header: enumJson(HEADER_STYLES, "classic: alineado a la izquierda; centered: centrado."),
        categories: enumJson(CATEGORY_STYLES, "plain: título simple; caps: mayúsculas espaciadas; underline: subrayado; band: franja del color de marca."),
        dividers: enumJson(DIVIDER_STYLES, "Separadores entre productos."),
        corners: enumJson(CORNER_STYLES, "Esquinas de tarjetas e imágenes."),
      },
    },
  },
} as const;

const rawProposalSchema = themeSchema.extend({ summary: z.string() });

export interface DesignProposal {
  theme: MenuTheme;
  summary: string;
}

export function parseDesignProposal(value: unknown): { ok: true; data: DesignProposal } | { ok: false; error: string } {
  const parsed = rawProposalSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const { summary, ...theme } = parsed.data;
  return { ok: true, data: { theme: fixTheme(theme), summary: cleanText(summary, 600) ?? "" } };
}
