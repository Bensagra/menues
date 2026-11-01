import { describe, expect, it } from "vitest";
import { dayLabel, groupByWeek, labelEvery, niceMax, parseRange, periodChange } from "@/domain/stats";
import { createRateLimiter, isAutomatedClient, isSameOrigin, trackEventSchema } from "@/server/track";

describe("eje de los gráficos", () => {
  it("elige máximos redondos con mitad entera", () => {
    expect(niceMax(0)).toBe(2);
    expect(niceMax(1)).toBe(2);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(10)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(42)).toBe(50);
    expect(niceMax(120)).toBe(200);
    expect(niceMax(5000)).toBe(5000);
    for (const v of [1, 3, 7, 11, 42, 99, 101, 777, 12345]) {
      const top = niceMax(v);
      expect(top).toBeGreaterThanOrEqual(v);
      expect(Number.isInteger(top / 2)).toBe(true);
    }
  });

  it("espacia las etiquetas según la cantidad de columnas", () => {
    expect(labelEvery(7)).toBe(1);
    expect(labelEvery(24)).toBe(5);
    expect(labelEvery(30)).toBe(5);
    expect(labelEvery(90)).toBe(15);
  });
});

describe("variación contra el período anterior", () => {
  it("no inventa porcentajes sin datos previos", () => {
    expect(periodChange(10, 0, false)).toEqual({ kind: "none" });
    expect(periodChange(10, 0, true)).toEqual({ kind: "new" });
    expect(periodChange(0, 0, true)).toEqual({ kind: "same" });
  });

  it("calcula subas y bajas redondeadas", () => {
    expect(periodChange(12, 10, true)).toEqual({ kind: "up", percent: 20 });
    expect(periodChange(5, 10, true)).toEqual({ kind: "down", percent: 50 });
    expect(periodChange(1001, 1000, true)).toEqual({ kind: "same" });
  });
});

describe("fechas y rangos", () => {
  it("rotula días sin correrse por la zona horaria", () => {
    expect(dayLabel("2026-10-27", "short")).toBe("27 oct");
    expect(dayLabel("2026-10-27", "weekday")).toBe("mar 27");
    expect(dayLabel("2026-01-01", "long")).toBe("jueves, 1 de enero");
  });

  it("agrupa por semanas que terminan hoy, con la primera incompleta", () => {
    const days = Array.from({ length: 9 }, (_, i) => ({ day: `2026-10-${String(19 + i).padStart(2, "0")}`, value: i + 1 }));
    expect(groupByWeek(days)).toEqual([
      { from: "2026-10-19", to: "2026-10-20", value: 3 },
      { from: "2026-10-21", to: "2026-10-27", value: 42 },
    ]);
    expect(groupByWeek([])).toEqual([]);
  });

  it("acepta solo los rangos ofrecidos", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("365")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("registro de visitas", () => {
  it("descarta bots, vistas previas de enlaces y clientes sin user agent", () => {
    expect(isAutomatedClient(null)).toBe(true);
    expect(isAutomatedClient("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
    expect(isAutomatedClient("WhatsApp/2.23.20.0")).toBe(true);
    expect(isAutomatedClient("facebookexternalhit/1.1")).toBe(true);
    expect(isAutomatedClient("curl/8.7.1")).toBe(true);
    expect(
      isAutomatedClient("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    ).toBe(false);
  });

  it("acepta solo eventos del mismo origen", () => {
    expect(isSameOrigin("https://cartalista.app", "same-origin", "cartalista.app")).toBe(true);
    expect(isSameOrigin("https://otro.com", null, "cartalista.app")).toBe(false);
    expect(isSameOrigin(null, "cross-site", "cartalista.app")).toBe(false);
    expect(isSameOrigin("no es una url", null, "cartalista.app")).toBe(false);
  });

  it("valida el evento y no acepta campos con datos de más", () => {
    expect(trackEventSchema.safeParse({ slug: "casa-oliva-palermo", event: "menu_view" }).success).toBe(true);
    expect(trackEventSchema.safeParse({ slug: "Casa Oliva", event: "menu_view" }).success).toBe(false);
    expect(trackEventSchema.safeParse({ slug: "casa-oliva", event: "purchase" }).success).toBe(false);
    expect(trackEventSchema.safeParse({ slug: "casa-oliva", event: "product_view", productId: "x" }).success).toBe(false);
  });

  it("limita eventos por cliente y ventana", () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000, maxKeys: 2 });
    expect([allow("a", 0), allow("a", 1), allow("a", 2), allow("a", 3)]).toEqual([true, true, true, false]);
    expect(allow("a", 1001)).toBe(true);
    expect(allow("b", 1001)).toBe(true);
    expect(allow("c", 1001)).toBe(true);
  });
});
