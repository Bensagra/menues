import { describe, expect, it } from "vitest";
import { DESIGN_JSON_SCHEMA, parseDesignProposal } from "@/domain/design-proposal";
import { contrastRatio } from "@/domain/contrast";
import {
  BODY_FONTS,
  DEFAULT_THEME,
  DISPLAY_FONTS,
  effectiveTheme,
  fixTheme,
  isDarkTheme,
  mixColors,
  parseTheme,
  themeCssVars,
  themeIssues,
  type MenuTheme,
} from "@/domain/theme";

/** Generador determinístico para probar muchas paletas sin depender del azar. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const randomHex = (next: () => number) =>
  `#${Math.floor(next() * 0xffffff)
    .toString(16)
    .padStart(6, "0")
    .toUpperCase()}`;

const withColors = (colors: Partial<MenuTheme["colors"]>): MenuTheme => ({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, ...colors } });

describe("diseño de la carta", () => {
  it("el diseño estándar cumple contraste y coincide con los tokens de la app", () => {
    expect(themeIssues(DEFAULT_THEME)).toEqual([]);
    expect(themeCssVars(DEFAULT_THEME)["--background"]).toBe("#F7F5EF");
    expect(themeCssVars(DEFAULT_THEME)["--menu-display"]).toBe("var(--font-fraunces)");
  });

  it("detecta texto ilegible sobre el fondo o las tarjetas", () => {
    const issues = themeIssues(withColors({ text: "#BBBBBB", accent: "#F0E68C" }));
    expect(issues.map((i) => `${i.color}/${i.on}`)).toEqual(["text/background", "text/surface", "accent/background", "accent/surface"]);
    expect(issues[0].message).toMatch(/texto no se lee bien/);
  });

  it("corregir el contraste siempre deja un diseño legible y conserva letras y estilo", () => {
    const next = rng(42);
    for (let i = 0; i < 600; i++) {
      const theme: MenuTheme = {
        colors: { background: randomHex(next), surface: randomHex(next), text: randomHex(next), muted: randomHex(next), accent: randomHex(next) },
        fonts: { display: "bebas", body: "lora" },
        style: { header: "centered", categories: "band", dividers: "none", corners: "round" },
      };
      const fixed = fixTheme(theme);
      expect(themeIssues(fixed), JSON.stringify(theme.colors)).toEqual([]);
      expect(fixed.fonts).toEqual(theme.fonts);
      expect(fixed.style).toEqual(theme.style);
    }
  });

  it("no toca un diseño que ya es legible", () => {
    const dark = withColors({ background: "#16181A", surface: "#202326", text: "#F2EFE9", muted: "#B9B4AA", accent: "#E8B44C" });
    expect(fixTheme(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
    expect(fixTheme(dark)).toEqual(dark);
  });

  it("en fondos oscuros los estados (abierto, cerrado) y el texto sobre la marca se siguen leyendo", () => {
    const dark = withColors({ background: "#16181A", surface: "#202326", text: "#F2EFE9", muted: "#B9B4AA", accent: "#E8B44C" });
    expect(isDarkTheme(dark)).toBe(true);
    const vars = themeCssVars(dark);
    for (const key of ["--success", "--warning"]) {
      expect(contrastRatio(vars[key], dark.colors.background)!).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars[key], dark.colors.surface)!).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(vars["--warning"], vars["--warning-surface"])!).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(vars["--brand-foreground"], dark.colors.accent)!).toBeGreaterThanOrEqual(4.5);
  });

  it("sin diseño propio usa el estándar con el color de marca del local", () => {
    expect(effectiveTheme(null, "#7a2341").colors.accent).toBe("#7A2341");
    expect(effectiveTheme(null, null)).toEqual(DEFAULT_THEME);
  });

  it("solo acepta valores de las listas y paletas legibles", () => {
    expect(parseTheme(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
    expect(parseTheme({ ...DEFAULT_THEME, fonts: { display: "comic_sans", body: "manrope" } })).toBeNull();
    expect(parseTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, accent: "red" } })).toBeNull();
    expect(parseTheme({ ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, text: "#F7F5EF" } })).toBeNull();
    expect(parseTheme({ ...DEFAULT_THEME, extra: "url(javascript:alert(1))" })).toEqual(DEFAULT_THEME);
    expect(parseTheme(null)).toBeNull();
  });

  it("mezcla colores en sRGB", () => {
    expect(mixColors("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixColors("#214E3B", "#214E3B", 0.3)).toBe("#214E3B");
  });
});

describe("propuesta de diseño de la IA", () => {
  const proposal = {
    summary: "  Tomé el verde de tu logo​ y la letra de tu carta impresa.  ",
    colors: { background: "#F6F1E7", surface: "#FFFDF8", text: "#2A2420", muted: "#6B6158", accent: "#9A4128" },
    fonts: { display: "playfair", body: "dm_sans" },
    style: { header: "centered", categories: "caps", dividers: "dotted", corners: "soft" },
  };

  it("valida, limpia el texto y corrige una paleta ilegible", () => {
    const ok = parseDesignProposal(proposal);
    expect(ok.ok && ok.data.summary).toBe("Tomé el verde de tu logo y la letra de tu carta impresa.");
    const illegible = parseDesignProposal({ ...proposal, colors: { ...proposal.colors, accent: "#F6F1E8" } });
    expect(illegible.ok).toBe(true);
    if (illegible.ok) expect(themeIssues(illegible.data.theme)).toEqual([]);
  });

  it("rechaza respuestas fuera del esquema", () => {
    expect(parseDesignProposal({ ...proposal, fonts: { display: "times", body: "dm_sans" } }).ok).toBe(false);
    expect(parseDesignProposal({ ...proposal, colors: { ...proposal.colors, text: "black" } }).ok).toBe(false);
    expect(parseDesignProposal({ colors: proposal.colors }).ok).toBe(false);
  });

  it("el esquema enviado a la IA ofrece exactamente las letras disponibles", () => {
    expect(DESIGN_JSON_SCHEMA.properties.fonts.properties.display.enum).toEqual(Object.keys(DISPLAY_FONTS));
    expect(DESIGN_JSON_SCHEMA.properties.fonts.properties.body.enum).toEqual(Object.keys(BODY_FONTS));
    expect(JSON.stringify(DESIGN_JSON_SCHEMA)).not.toContain("maxItems");
  });
});
