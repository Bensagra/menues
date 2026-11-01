import { currencyExponent, decimalStringToMinor, MAX_MINOR } from "./money";

// Interpretación de precios impresos en una carta. Es deliberadamente
// conservadora: ante cualquier duda marca el precio como ambiguo para que una
// persona lo revise. Nunca convierte un precio ilegible en cero.

export type PrintedPrice =
  | { kind: "absent" }
  | { kind: "value"; minor: number }
  | { kind: "ambiguous"; candidates: number[]; reason: AmbiguityReason }
  | { kind: "invalid"; reason: "not_a_price" | "zero" | "too_large" };

export type AmbiguityReason = "decimal_or_thousands" | "multiple_prices" | "model_disagrees" | "no_printed_text";

function toMinor(integerDigits: string, fractionDigits: string, exponent: number): number | null {
  if (fractionDigits.length > exponent) return null;
  const minor = Number(integerDigits + fractionDigits.padEnd(exponent, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Interpreta un precio como texto impreso (por ejemplo "$ 12.500", "12,5", "1.200.-"). */
export function interpretPrintedPrice(text: string | null | undefined, currency: string): PrintedPrice {
  if (!text) return { kind: "absent" };
  const exponent = currencyExponent(currency);
  const cleaned = text
    .replace(/\s| /g, "")
    .replace(/^(ars|us\$|u\$s|usd|\$|€|r\$|s\/\.?|bs\.?)/i, "")
    .replace(/[.,]-$/, "")
    .replace(/-$/, "");

  const numbers = cleaned.match(/\d[\d.,]*/g) ?? [];
  if (numbers.length === 0) return { kind: "invalid", reason: "not_a_price" };
  if (numbers.length > 1) {
    const candidates = numbers
      .map((n) => interpretPrintedPrice(n, currency))
      .flatMap((r) => (r.kind === "value" ? [r.minor] : []));
    return { kind: "ambiguous", candidates, reason: "multiple_prices" };
  }
  const token = (numbers[0] ?? "").replace(/[.,]$/, "");
  if (!/^\d[\d.,]*$/.test(token)) return { kind: "invalid", reason: "not_a_price" };

  const separators = token.replace(/\d/g, "");
  let result: number | null = null;
  let candidates: number[] = [];

  if (!separators) {
    result = toMinor(token, "", exponent);
  } else {
    const groups = token.split(/[.,]/);
    const uniqueSeparators = new Set(separators.split(""));
    if (uniqueSeparators.size === 2) {
      // "12.500,50" o "12,500.50": el último separador es el decimal.
      const lastSep = token[token.search(/[.,][^.,]*$/)];
      const [intRaw, frac] = [token.slice(0, token.lastIndexOf(lastSep)), token.slice(token.lastIndexOf(lastSep) + 1)];
      const intDigits = intRaw.replace(/[.,]/g, "");
      const validGroups = intRaw.split(/[.,]/).every((g, i) => (i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g)));
      result = validGroups ? toMinor(intDigits, frac, exponent) : null;
    } else if (groups.length > 2) {
      // "1.250.000": separador de miles.
      const valid = /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g));
      result = valid ? toMinor(groups.join(""), "", exponent) : null;
    } else {
      const [whole, part] = groups;
      if (part.length === 3) {
        // "12.500" → miles. Con decimales de 3 dígitos no hay otra lectura válida.
        result = toMinor(whole + part, "", exponent);
      } else if (part.length <= 2 && exponent > 0) {
        // "12,5" o "12.50": puede ser 12,50 o una abreviatura de 12.500.
        const asDecimal = toMinor(whole, part, exponent);
        const asThousands = toMinor(whole + part.padEnd(3, "0"), "", exponent);
        candidates = [asDecimal, asThousands].filter((v): v is number => v !== null);
        return { kind: "ambiguous", candidates, reason: "decimal_or_thousands" };
      } else if (part.length <= 2 && exponent === 0) {
        result = toMinor(whole + part.padEnd(3, "0"), "", exponent);
        if (part.length < 3) return { kind: "ambiguous", candidates: result !== null ? [result] : [], reason: "decimal_or_thousands" };
      }
    }
  }

  if (result === null) return { kind: "invalid", reason: "not_a_price" };
  if (result === 0) return { kind: "invalid", reason: "zero" };
  if (result > MAX_MINOR) return { kind: "invalid", reason: "too_large" };
  return { kind: "value", minor: result };
}

export type ResolvedPrice =
  | { status: "absent" }
  | { status: "ok"; minor: number }
  | { status: "review"; minor: number | null; candidates: number[]; reason: AmbiguityReason | "illegible" | "invalid" }
  | { status: "illegible" };

/**
 * Combina la lectura propia del texto impreso con la interpretación del modelo.
 * - Si coinciden: se acepta.
 * - Si el texto es ambiguo y el modelo eligió una de las lecturas posibles: se
 *   propone esa lectura, pero queda marcada para revisión.
 * - Si no coinciden o falta el texto impreso: revisión obligatoria.
 */
export function resolvePrice(
  priceText: string | null,
  priceValue: string | null,
  currency: string,
  markedIllegible: boolean,
): ResolvedPrice {
  if (markedIllegible) return { status: "illegible" };
  const modelMinor = priceValue ? decimalStringToMinor(priceValue, currency) : null;
  const printed = interpretPrintedPrice(priceText, currency);

  if (printed.kind === "absent") {
    if (modelMinor !== null) return { status: "review", minor: null, candidates: [modelMinor], reason: "no_printed_text" };
    return { status: "absent" };
  }
  if (printed.kind === "invalid") {
    return { status: "review", minor: null, candidates: modelMinor !== null ? [modelMinor] : [], reason: "invalid" };
  }
  if (printed.kind === "value") {
    if (modelMinor === null || modelMinor === printed.minor) return { status: "ok", minor: printed.minor };
    return { status: "review", minor: printed.minor, candidates: [printed.minor, modelMinor], reason: "model_disagrees" };
  }
  const chosen = modelMinor !== null && printed.candidates.includes(modelMinor) ? modelMinor : null;
  return { status: "review", minor: chosen, candidates: printed.candidates, reason: printed.reason };
}
