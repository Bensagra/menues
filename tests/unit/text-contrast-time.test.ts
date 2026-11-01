import { describe, expect, it } from "vitest";
import { contrastRatio, isLegibleBrandColor, BRAND_PRESETS } from "@/domain/contrast";
import { cleanText, isValidSlug, looseKey, nameKey, similarity, slugify } from "@/domain/text";
import { describeOpenStatus, openStatus, zonedTimeToUtc, type OpeningInterval } from "@/domain/time";

describe("normalización", () => {
  it("coincide con la clave de la base", () => {
    expect(nameKey('  Ñoquis de Papa — "Caseros"!  ')).toBe("noquis de papa caseros");
    expect(nameKey("Muzzarella  (Grande)")).toBe("muzzarella grande");
  });

  it("la clave laxa ignora plurales y palabras vacías", () => {
    expect(looseKey("Empanadas de carne")).toBe(looseKey("Empanada carne"));
  });

  it("mide similitud", () => {
    expect(similarity("Mozzarella", "Muzzarella")).toBeGreaterThan(0.8);
    expect(similarity("Flan casero", "Bife de chorizo")).toBeLessThan(0.5);
  });

  it("limpia texto no confiable", () => {
    expect(cleanText("  Hola\u0000\n mundo​ ", 50)).toBe("Hola mundo");
    expect(cleanText("   ", 50)).toBeNull();
    expect(cleanText("x".repeat(100), 10)).toHaveLength(10);
  });

  it("genera y valida slugs", () => {
    expect(slugify("Casa Oliva — Palermo")).toBe("casa-oliva-palermo");
    expect(isValidSlug("casa-oliva")).toBe(true);
    expect(isValidSlug("Casa Oliva")).toBe(false);
    expect(isValidSlug("ab")).toBe(false);
  });
});

describe("tokens de diseño: contraste WCAG AA", () => {
  const pairs: [string, string, string, number][] = [
    ["texto principal", "#202A24", "#F7F5EF", 4.5],
    ["texto secundario sobre fondo", "#626B64", "#F7F5EF", 4.5],
    ["texto secundario sobre superficie", "#626B64", "#FFFFFF", 4.5],
    ["primario con texto blanco", "#214E3B", "#FFFFFF", 4.5],
    ["hover primario con texto blanco", "#17392B", "#FFFFFF", 4.5],
    ["acento terracota sobre superficie", "#B65335", "#FFFFFF", 4.5],
    ["éxito sobre selección", "#246344", "#E8F0E9", 4.5],
    ["advertencia", "#8A5700", "#FFF3D6", 4.5],
    ["error", "#B42318", "#FEECE9", 4.5],
    ["información", "#235B83", "#EAF3FA", 4.5],
    ["borde de controles", "#858D86", "#FFFFFF", 3],
  ];
  it.each(pairs)("%s", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it("todas las combinaciones de marca sugeridas son legibles", () => {
    for (const preset of BRAND_PRESETS) expect(isLegibleBrandColor(preset.value), preset.name).toBe(true);
    expect(isLegibleBrandColor("#FFD700")).toBe(false);
  });
});

describe("horarios en la zona de la sucursal", () => {
  const tz = "America/Argentina/Buenos_Aires"; // UTC-3, sin horario de verano
  const hours: OpeningInterval[] = [
    { day: 5, open: "20:00", close: "01:30" }, // viernes noche
    { day: 6, open: "12:00", close: "16:00" },
  ];

  it("está abierto el viernes 23:00 local", () => {
    // Viernes 30/10/2026 23:00 en Buenos Aires = sábado 02:00 UTC
    const status = openStatus(hours, new Date("2026-10-31T02:00:00Z"), tz);
    expect(status).toEqual({ state: "open", closesAt: "01:30" });
  });

  it("sigue abierto pasada la medianoche", () => {
    // Sábado 00:45 local
    expect(openStatus(hours, new Date("2026-10-31T03:45:00Z"), tz).state).toBe("open");
  });

  it("cerrado: informa la próxima apertura", () => {
    // Sábado 09:00 local
    const status = openStatus(hours, new Date("2026-10-31T12:00:00Z"), tz);
    expect(describeOpenStatus(status)).toBe("Cerrado · abre hoy a las 12:00");
  });

  it("convierte hora local a UTC", () => {
    expect(zonedTimeToUtc("2026-11-01", "12:00", tz).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "12:00", "Europe/Madrid").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "12:00", "Europe/Madrid").toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });
});
