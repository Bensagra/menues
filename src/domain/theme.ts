import { z } from "zod";
import { contrastRatio, relativeLuminance } from "./contrast";

// Diseño de la carta pública: paleta, tipografías y estilo. Lo propone la IA a
// partir de la identidad del local o lo ajusta el dueño a mano. Todo se elige
// de listas cerradas (nunca CSS libre) y la paleta siempre cumple contraste AA:
// themeIssues() es la regla y app.is_valid_theme() la repite en la base.

export const DISPLAY_FONTS = {
  fraunces: { label: "Fraunces", hint: "Serif cálida y actual", cssVar: "--font-fraunces" },
  playfair: { label: "Playfair Display", hint: "Serif elegante, de bistró o vinoteca", cssVar: "--font-playfair" },
  dm_serif: { label: "DM Serif Display", hint: "Serif clásica y marcada", cssVar: "--font-dm-serif" },
  cormorant: { label: "Cormorant Garamond", hint: "Serif fina, de alta cocina", cssVar: "--font-cormorant" },
  libre_baskerville: { label: "Libre Baskerville", hint: "Tradicional, de bodegón o restaurante clásico", cssVar: "--font-baskerville" },
  bebas: { label: "Bebas Neue", hint: "Condensada en mayúsculas, de hamburguesería o cervecería", cssVar: "--font-bebas" },
  oswald: { label: "Oswald", hint: "Condensada y urbana", cssVar: "--font-oswald" },
  archivo_black: { label: "Archivo Black", hint: "Gruesa y contundente, de comida al paso", cssVar: "--font-archivo-black" },
  josefin: { label: "Josefin Sans", hint: "Geométrica con aire vintage, de café", cssVar: "--font-josefin" },
  space_grotesk: { label: "Space Grotesk", hint: "Moderna, de café de especialidad", cssVar: "--font-space-grotesk" },
  caveat: { label: "Caveat", hint: "Manuscrita, como un pizarrón", cssVar: "--font-caveat" },
  pacifico: { label: "Pacifico", hint: "Cursiva relajada, de heladería o playa", cssVar: "--font-pacifico" },
  manrope: { label: "Manrope", hint: "Sans limpia y neutra", cssVar: "--font-manrope" },
} as const;

export const BODY_FONTS = {
  manrope: { label: "Manrope", hint: "Sans limpia y neutra", cssVar: "--font-manrope" },
  dm_sans: { label: "DM Sans", hint: "Sans redondeada y amable", cssVar: "--font-dm-sans" },
  work_sans: { label: "Work Sans", hint: "Sans con carácter, muy legible", cssVar: "--font-work-sans" },
  lora: { label: "Lora", hint: "Serif para textos, clásica", cssVar: "--font-lora" },
} as const;

export const HEADER_STYLES = { classic: "Alineado a la izquierda", centered: "Centrado" } as const;
export const CATEGORY_STYLES = {
  plain: "Título simple",
  caps: "Mayúsculas espaciadas",
  underline: "Subrayado",
  band: "Franja de color",
} as const;
export const DIVIDER_STYLES = { dashed: "Línea punteada", dotted: "Puntos", solid: "Línea continua", none: "Sin líneas" } as const;
export const CORNER_STYLES = { square: "Rectos", soft: "Suaves", round: "Redondeados" } as const;

export type DisplayFont = keyof typeof DISPLAY_FONTS;
export type BodyFont = keyof typeof BODY_FONTS;

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color no válido")
  .transform((v) => v.toUpperCase());

export const THEME_COLOR_KEYS = ["background", "surface", "text", "muted", "accent"] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

export const themeSchema = z.object({
  colors: z.object({ background: hex, surface: hex, text: hex, muted: hex, accent: hex }),
  fonts: z.object({ display: z.enum(keys(DISPLAY_FONTS)), body: z.enum(keys(BODY_FONTS)) }),
  style: z.object({
    header: z.enum(keys(HEADER_STYLES)),
    categories: z.enum(keys(CATEGORY_STYLES)),
    dividers: z.enum(keys(DIVIDER_STYLES)),
    corners: z.enum(keys(CORNER_STYLES)),
  }),
});

export type MenuTheme = z.infer<typeof themeSchema>;

export const COLOR_LABELS: Record<ThemeColorKey, { label: string; hint: string }> = {
  background: { label: "Fondo", hint: "El fondo de toda la carta." },
  surface: { label: "Tarjetas", hint: "Buscador, horarios y ventanas de producto." },
  text: { label: "Texto", hint: "Nombres de productos y precios." },
  muted: { label: "Texto secundario", hint: "Descripciones y datos del local." },
  accent: { label: "Color de marca", hint: "Nombre del local y títulos de categorías." },
};

/** El diseño estándar de CartaLista (el que se usa si el local no eligió otro). */
export const DEFAULT_THEME: MenuTheme = {
  colors: { background: "#F7F5EF", surface: "#FFFFFF", text: "#202A24", muted: "#626B64", accent: "#214E3B" },
  fonts: { display: "fraunces", body: "manrope" },
  style: { header: "classic", categories: "plain", dividers: "dashed", corners: "soft" },
};

/** Diseño efectivo de la carta: el elegido o el estándar con el color de marca del local. */
export function effectiveTheme(theme: MenuTheme | null | undefined, brandColor?: string | null): MenuTheme {
  if (theme) return theme;
  if (!brandColor) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, accent: brandColor.toUpperCase() } };
}

export function parseTheme(value: unknown): MenuTheme | null {
  const parsed = themeSchema.safeParse(value);
  return parsed.success && themeIssues(parsed.data).length === 0 ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------
export const MIN_CONTRAST = 4.5;

/** Pares que deben leerse bien (texto sobre fondo y sobre tarjetas). */
const CONTRAST_RULES: { color: ThemeColorKey; on: ThemeColorKey; message: string }[] = [
  { color: "text", on: "background", message: "El texto no se lee bien sobre el fondo." },
  { color: "text", on: "surface", message: "El texto no se lee bien sobre las tarjetas." },
  { color: "muted", on: "background", message: "El texto secundario no se lee bien sobre el fondo." },
  { color: "muted", on: "surface", message: "El texto secundario no se lee bien sobre las tarjetas." },
  { color: "accent", on: "background", message: "El color de marca no se lee bien sobre el fondo." },
  { color: "accent", on: "surface", message: "El color de marca no se lee bien sobre las tarjetas." },
];

export interface ThemeIssue {
  color: ThemeColorKey;
  on: ThemeColorKey;
  ratio: number;
  message: string;
}

export function themeIssues(theme: MenuTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  for (const rule of CONTRAST_RULES) {
    const ratio = contrastRatio(theme.colors[rule.color], theme.colors[rule.on]) ?? 0;
    if (ratio < MIN_CONTRAST) issues.push({ ...rule, ratio: Math.round(ratio * 100) / 100 });
  }
  return issues;
}

function toRgb(value: string): [number, number, number] {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla dos colores: t = 0 devuelve a, t = 1 devuelve b. */
export function mixColors(a: string, b: string, t: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.min(1, Math.max(0, t))));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const lum = (value: string) => relativeLuminance(value) ?? 0;

/** Lleva un color hacia el negro o el blanco hasta que se lea sobre todos los fondos dados. */
export function ensureContrast(color: string, against: string[], min = MIN_CONTRAST): string {
  const passes = (c: string) => against.every((bg) => (contrastRatio(c, bg) ?? 0) >= min);
  if (passes(color)) return color.toUpperCase();
  const target = lum(against[0]) >= 0.18 ? "#000000" : "#FFFFFF";
  for (let step = 1; step <= 20; step++) {
    const candidate = mixColors(color, target, step / 20);
    if (passes(candidate)) return candidate;
  }
  return target;
}

/** true si el fondo es oscuro (texto claro encima). */
export function isDarkTheme(theme: MenuTheme): boolean {
  return lum(theme.colors.background) < 0.18;
}

/**
 * Corrige la paleta para que cumpla contraste AA cambiando lo mínimo: primero
 * evita fondos de luminosidad media (donde ni el texto claro ni el oscuro se
 * leen bien), después acerca las tarjetas al fondo y por último oscurece o
 * aclara los textos. Siempre devuelve un diseño sin problemas de contraste.
 */
export function fixTheme(theme: MenuTheme): MenuTheme {
  let { background, surface } = theme.colors;
  const bgLum = lum(background);
  if (bgLum < 0.25 && bgLum > 0.06) {
    const target = bgLum >= 0.15 ? "#FFFFFF" : "#000000";
    for (let step = 1; step <= 20; step++) {
      background = mixColors(theme.colors.background, target, step / 20);
      const l = lum(background);
      if (l >= 0.25 || l <= 0.06) break;
    }
  }
  const light = lum(background) >= 0.25;
  const surfaceLum = lum(surface);
  if (light ? surfaceLum < 0.25 : surfaceLum > 0.08) {
    surface = light ? mixColors(background, "#FFFFFF", 0.6) : mixColors(background, "#FFFFFF", 0.05);
  }
  const fixed: MenuTheme = {
    ...theme,
    colors: {
      background,
      surface,
      text: ensureContrast(theme.colors.text, [background, surface]),
      muted: ensureContrast(theme.colors.muted, [background, surface]),
      accent: ensureContrast(theme.colors.accent, [background, surface]),
    },
  };
  return themeIssues(fixed).length === 0 ? fixed : { ...theme, colors: DEFAULT_THEME.colors };
}

// ---------------------------------------------------------------------------
// Variables CSS para la carta
// ---------------------------------------------------------------------------
const RADIUS = { square: "3px", soft: "10px", round: "18px" } as const;

/**
 * Variables CSS del diseño. Reemplazan los tokens de la interfaz (fondo,
 * tarjetas, texto, bordes, estados) dentro de la carta, así los componentes
 * comunes (buscador, diálogos) también toman la paleta.
 */
export function themeCssVars(theme: MenuTheme): Record<string, string> {
  const { background, surface, text, muted, accent } = theme.colors;
  const dark = isDarkTheme(theme);
  const success = ensureContrast(dark ? "#7FCB9B" : "#246344", [background, surface]);
  const warningSurface = dark ? mixColors(background, "#E0A030", 0.18) : "#FFF3D6";
  const warning = ensureContrast(dark ? "#F2C66D" : "#8A5700", [background, surface, warningSurface]);
  const onAccent = (contrastRatio("#FFFFFF", accent) ?? 0) >= (contrastRatio(background, accent) ?? 0) ? "#FFFFFF" : background;
  return {
    "--background": background,
    "--foreground": text,
    "--card": surface,
    "--card-foreground": text,
    "--popover": surface,
    "--popover-foreground": text,
    "--muted": background,
    "--muted-foreground": muted,
    "--secondary": mixColors(background, accent, 0.1),
    "--secondary-foreground": text,
    "--brand": accent,
    "--brand-foreground": onAccent,
    "--ring": accent,
    "--border": mixColors(background, text, 0.16),
    "--input": ensureContrast(mixColors(background, text, 0.45), [background, surface], 3),
    "--success": success,
    "--warning": warning,
    "--warning-surface": warningSurface,
    "--menu-display": `var(${DISPLAY_FONTS[theme.fonts.display].cssVar})`,
    "--menu-body": `var(${BODY_FONTS[theme.fonts.body].cssVar})`,
    "--menu-radius": RADIUS[theme.style.corners],
  };
}
