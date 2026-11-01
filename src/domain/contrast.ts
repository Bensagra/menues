// Contraste WCAG 2.x. Debe coincidir con app.contrast_ratio() en la base.

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => channel(parseInt(part, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const MENU_BACKGROUND = "#F7F5EF";

/** Un color de marca se usa con texto blanco encima y como texto sobre el fondo de la carta. */
export function isLegibleBrandColor(hex: string): boolean {
  const onWhite = contrastRatio(hex, "#FFFFFF");
  const onBackground = contrastRatio(hex, MENU_BACKGROUND);
  return onWhite !== null && onBackground !== null && onWhite >= 4.5 && onBackground >= 4.5;
}

/** Combinaciones sugeridas: todas cumplen AA con texto blanco y sobre el fondo. */
export const BRAND_PRESETS = [
  { name: "Bosque", value: "#214E3B" },
  { name: "Terracota", value: "#9A4128" },
  { name: "Ladrillo", value: "#7B3F2A" },
  { name: "Vino", value: "#7A2341" },
  { name: "Noche", value: "#24365C" },
  { name: "Grafito", value: "#33393B" },
  { name: "Oliva", value: "#4D5A1E" },
  { name: "Ciruela", value: "#5B2E63" },
] as const;
