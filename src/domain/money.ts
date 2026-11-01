// Importes exactos en unidades menores (centavos). Nunca se usan números de
// punto flotante para calcular: las conversiones se hacen con enteros y strings.

export const CURRENCIES = {
  ARS: { exponent: 2, label: "Peso argentino" },
  USD: { exponent: 2, label: "Dólar estadounidense" },
  EUR: { exponent: 2, label: "Euro" },
  UYU: { exponent: 2, label: "Peso uruguayo" },
  BRL: { exponent: 2, label: "Real" },
  MXN: { exponent: 2, label: "Peso mexicano" },
  PEN: { exponent: 2, label: "Sol" },
  COP: { exponent: 2, label: "Peso colombiano" },
  BOB: { exponent: 2, label: "Boliviano" },
  CLP: { exponent: 0, label: "Peso chileno" },
  PYG: { exponent: 0, label: "Guaraní" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const MAX_MINOR = 100_000_000_000;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function currencyExponent(currency: string): number {
  if (!isCurrencyCode(currency)) throw new Error(`Moneda no soportada: ${currency}`);
  return CURRENCIES[currency].exponent;
}

function pow10(exponent: number): number {
  return 10 ** exponent;
}

/** Convierte unidades menores a un decimal exacto en texto ("12500.5" → "12500.50"). */
export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Importe inválido");
  const exponent = currencyExponent(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  if (exponent === 0) return `${negative ? "-" : ""}${abs}`;
  const factor = pow10(exponent);
  const whole = Math.floor(abs / factor);
  const fraction = String(abs % factor).padStart(exponent, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string, fractionDigits: number) {
  const key = `${locale}|${currency}|${fractionDigits}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Formatea un importe en la moneda y el formato local del negocio.
 * Por defecto omite los centavos cuando son cero ("$ 12.500").
 */
export function formatMoney(
  minor: number | null | undefined,
  currency: string,
  locale = "es-AR",
  options: { cents?: "auto" | "always" } = {},
): string {
  if (minor === null || minor === undefined) return "";
  const exponent = currencyExponent(currency);
  const hasCents = exponent > 0 && minor % pow10(exponent) !== 0;
  const digits = options.cents === "always" || hasCents ? exponent : 0;
  // Intl.NumberFormat acepta strings decimales exactos: no hay conversión a float.
  const decimal = minorToDecimalString(minor, currency) as unknown as number;
  return getFormatter(locale, currency, digits).format(decimal);
}

export type ParseResult = { ok: true; minor: number } | { ok: false; error: "empty" | "invalid" | "too_many_decimals" | "too_large" | "negative" };

/**
 * Interpreta lo que una persona escribe en un campo de precio.
 * Acepta "12500", "12.500", "12.500,50", "12500,5", "$ 12.500" y también
 * punto decimal cuando no es ambiguo ("12.5" → 12,50).
 */
export function parseMoneyInput(raw: string, currency: string): ParseResult {
  const exponent = currencyExponent(currency);
  const text = raw.replace(/[\s ]/g, "").replace(/^[^\d,.-]+/, "").replace(/[.,]-$/, "");
  if (!text) return { ok: false, error: "empty" };
  if (text.startsWith("-")) return { ok: false, error: "negative" };
  if (!/^[\d.,]+$/.test(text)) return { ok: false, error: "invalid" };

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let integerPart: string;
  let fractionPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const groupSep = decimalSep === "," ? "." : ",";
    const [intRaw, frac, ...rest] = text.split(decimalSep);
    if (rest.length > 0) return { ok: false, error: "invalid" };
    if (!isValidGrouping(intRaw, groupSep)) return { ok: false, error: "invalid" };
    integerPart = intRaw.split(groupSep).join("");
    fractionPart = frac;
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = text.split(sep);
    if (parts.length > 2 || parts[parts.length - 1].length === 3) {
      // "1.250.000" o "12.500": separador de miles.
      if (!isValidGrouping(text, sep)) return { ok: false, error: "invalid" };
      integerPart = parts.join("");
    } else {
      integerPart = parts[0];
      fractionPart = parts[1] ?? "";
    }
  } else {
    integerPart = text;
  }

  if (!/^\d+$/.test(integerPart || "0") || !/^\d*$/.test(fractionPart)) return { ok: false, error: "invalid" };
  if (fractionPart.length > exponent) return { ok: false, error: "too_many_decimals" };
  const minorText = (integerPart || "0") + fractionPart.padEnd(exponent, "0");
  const normalized = minorText.replace(/^0+(?=\d)/, "");
  if (normalized.length > 15) return { ok: false, error: "too_large" };
  const minor = Number(normalized);
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return { ok: false, error: "too_large" };
  return { ok: true, minor };
}

function isValidGrouping(text: string, sep: string): boolean {
  if (!text.includes(sep)) return /^\d+$/.test(text);
  const groups = text.split(sep);
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

/** Valor para un <input> editable: "12500" o "12500,50" según la moneda. */
export function minorToInputValue(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const decimal = minorToDecimalString(minor, currency);
  const [whole, fraction] = decimal.split(".");
  if (!fraction || /^0+$/.test(fraction)) return whole;
  return `${whole},${fraction}`;
}

/** Convierte un decimal exacto en texto ("12500.5") a unidades menores. */
export function decimalStringToMinor(value: string, currency: string): number | null {
  const exponent = currencyExponent(currency);
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent && !/^0+$/.test(fraction.slice(exponent))) return null;
  const minor = Number(match[1] + fraction.slice(0, exponent).padEnd(exponent, "0"));
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

// ---------------------------------------------------------------------------
// Ajustes masivos de precio (enteros + redondeo explícito)
// ---------------------------------------------------------------------------

export type RoundingMode = "none" | "nearest" | "up" | "down";

/**
 * Aplica un porcentaje expresado en puntos básicos (12,5 % = 1250) con
 * redondeo "half up" al entero de unidades menores más cercano.
 */
export function applyPercent(minor: number, basisPoints: number): number {
  if (!Number.isSafeInteger(minor) || !Number.isSafeInteger(basisPoints)) throw new Error("Valor inválido");
  const numerator = BigInt(minor) * BigInt(10_000 + basisPoints);
  const denominator = BigInt(10_000);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
  return Number(rounded < BigInt(0) ? BigInt(0) : rounded);
}

/** Redondea a un múltiplo (por ejemplo, 10 000 = $100 en ARS). */
export function roundToStep(minor: number, step: number, mode: RoundingMode): number {
  if (mode === "none" || step <= 1) return minor;
  const remainder = minor % step;
  if (remainder === 0) return minor;
  const down = minor - remainder;
  if (mode === "down") return down;
  if (mode === "up") return down + step;
  return remainder * 2 >= step ? down + step : down;
}

/** Interpreta un porcentaje escrito ("12,5" o "-10") como puntos básicos. */
export function parsePercentInput(raw: string): number | null {
  const text = raw.trim().replace(",", ".").replace("%", "");
  const match = /^([+-]?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const value = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (value > 50_000) return null;
  return match[1] === "-" ? -value : value;
}
