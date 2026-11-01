import { describe, expect, it } from "vitest";
import { interpretPrintedPrice, resolvePrice } from "@/domain/printed-price";

describe("interpretPrintedPrice", () => {
  it.each([
    ["$ 12.500", 1250000],
    ["12500", 1250000],
    ["$12.500,00", 1250000],
    ["1.200.-", 120000],
    ["$ 1.250.000", 125000000],
    ["ARS 9800", 980000],
  ])("lee %s sin ambigüedad", (text, minor) => {
    expect(interpretPrintedPrice(text, "ARS")).toEqual({ kind: "value", minor });
  });

  it("marca como ambiguo un número con 1 o 2 decimales (¿12,50 o 12.500?)", () => {
    expect(interpretPrintedPrice("12,5", "ARS")).toEqual({
      kind: "ambiguous",
      candidates: [1250, 1250000],
      reason: "decimal_or_thousands",
    });
  });

  it("marca como ambiguo un texto con más de un precio", () => {
    const result = interpretPrintedPrice("12.000 / 15.000", "ARS");
    expect(result.kind).toBe("ambiguous");
  });

  it("nunca convierte en cero", () => {
    expect(interpretPrintedPrice("$ 0", "ARS")).toEqual({ kind: "invalid", reason: "zero" });
    expect(interpretPrintedPrice("Consultar", "ARS")).toEqual({ kind: "invalid", reason: "not_a_price" });
    expect(interpretPrintedPrice(null, "ARS")).toEqual({ kind: "absent" });
  });
});

describe("resolvePrice", () => {
  it("acepta cuando el texto y el modelo coinciden", () => {
    expect(resolvePrice("$ 12.500", "12500", "ARS", false)).toEqual({ status: "ok", minor: 1250000 });
  });

  it("pide revisión cuando el modelo y el texto no coinciden", () => {
    expect(resolvePrice("$ 12.500", "1250", "ARS", false)).toMatchObject({ status: "review", reason: "model_disagrees" });
  });

  it("propone la lectura del modelo en un formato ambiguo, pero exige revisión", () => {
    expect(resolvePrice("12,5", "12500", "ARS", false)).toEqual({
      status: "review",
      minor: 1250000,
      candidates: [1250, 1250000],
      reason: "decimal_or_thousands",
    });
  });

  it("un campo marcado como ilegible queda ilegible aunque haya un valor", () => {
    expect(resolvePrice("1?.500", "12500", "ARS", true)).toEqual({ status: "illegible" });
  });

  it("un valor del modelo sin texto impreso exige revisión", () => {
    expect(resolvePrice(null, "12500", "ARS", false)).toMatchObject({ status: "review", minor: null, reason: "no_printed_text" });
  });

  it("sin precio impreso no inventa nada", () => {
    expect(resolvePrice(null, null, "ARS", false)).toEqual({ status: "absent" });
  });
});
