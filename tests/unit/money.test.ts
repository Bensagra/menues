import { describe, expect, it } from "vitest";
import {
  applyPercent,
  decimalStringToMinor,
  formatMoney,
  minorToDecimalString,
  minorToInputValue,
  parseMoneyInput,
  parsePercentInput,
  roundToStep,
} from "@/domain/money";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("formatea ARS con separadores locales y sin centavos cuando son cero", () => {
    expect(nbsp(formatMoney(1250000, "ARS"))).toBe("$ 12.500");
    expect(nbsp(formatMoney(1250050, "ARS"))).toBe("$ 12.500,50");
    expect(nbsp(formatMoney(1250000, "ARS", "es-AR", { cents: "always" }))).toBe("$ 12.500,00");
  });

  it("respeta monedas sin decimales", () => {
    expect(nbsp(formatMoney(12500, "CLP", "es-CL"))).toBe("$12.500");
  });

  it("no pierde precisión con importes grandes", () => {
    expect(minorToDecimalString(99999999999, "ARS")).toBe("999999999.99");
    expect(nbsp(formatMoney(99999999999, "ARS"))).toBe("$ 999.999.999,99");
  });

  it("devuelve vacío para importes nulos", () => {
    expect(formatMoney(null, "ARS")).toBe("");
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["12500", 1250000],
    ["12.500", 1250000],
    ["12.500,50", 1250050],
    ["12500,5", 1250050],
    ["$ 12.500", 1250000],
    ["1.250.000", 125000000],
    ["12.5", 1250],
    ["1,250.50", 125050],
    ["0", 0],
  ])("interpreta %s", (input, expected) => {
    expect(parseMoneyInput(input, "ARS")).toEqual({ ok: true, minor: expected });
  });

  it.each(["", "abc", "12,345,6", "-50", "12,505"])("rechaza %s", (input) => {
    const result = parseMoneyInput(input, "ARS");
    if (input === "12,505") {
      expect(result).toEqual({ ok: true, minor: 1250500 });
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("rechaza decimales en monedas sin centavos", () => {
    expect(parseMoneyInput("12,5", "CLP")).toEqual({ ok: false, error: "too_many_decimals" });
  });

  it("ida y vuelta con el valor editable", () => {
    expect(minorToInputValue(1250050, "ARS")).toBe("12500,50");
    expect(minorToInputValue(1250000, "ARS")).toBe("12500");
    expect(parseMoneyInput(minorToInputValue(1250050, "ARS"), "ARS")).toEqual({ ok: true, minor: 1250050 });
  });
});

describe("decimalStringToMinor", () => {
  it("convierte decimales exactos", () => {
    expect(decimalStringToMinor("12500", "ARS")).toBe(1250000);
    expect(decimalStringToMinor("12500.5", "ARS")).toBe(1250050);
    expect(decimalStringToMinor("0.1", "ARS")).toBe(10);
    expect(decimalStringToMinor("12,5", "ARS")).toBeNull();
  });
});

describe("ajustes masivos", () => {
  it("aplica porcentajes con enteros y redondeo half-up", () => {
    expect(applyPercent(1000000, 1000)).toBe(1100000);
    expect(applyPercent(999, 1250)).toBe(1124); // 1123,875 → 1124
    expect(applyPercent(1000000, -1000)).toBe(900000);
    expect(applyPercent(100, -20000)).toBe(0);
  });

  it("evita los errores de punto flotante", () => {
    // 0,1 + 0,2 en float no es 0,3; en unidades menores sí.
    expect(applyPercent(10, 20000)).toBe(30);
  });

  it("redondea a múltiplos", () => {
    expect(roundToStep(1234567, 10000, "nearest")).toBe(1230000);
    expect(roundToStep(1235000, 10000, "nearest")).toBe(1240000);
    expect(roundToStep(1230001, 10000, "up")).toBe(1240000);
    expect(roundToStep(1239999, 10000, "down")).toBe(1230000);
    expect(roundToStep(1239999, 10000, "none")).toBe(1239999);
  });

  it("interpreta porcentajes escritos", () => {
    expect(parsePercentInput("12,5")).toBe(1250);
    expect(parsePercentInput("-10")).toBe(-1000);
    expect(parsePercentInput("10%")).toBe(1000);
    expect(parsePercentInput("abc")).toBeNull();
  });
});
