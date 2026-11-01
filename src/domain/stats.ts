// Helpers puros para las estadísticas del panel.

/**
 * Máximo "redondo" para el eje, elegido para que la mitad también sea entera
 * (la grilla se rotula en 0, mitad y máximo): pares hasta 10; después 1, 2 o 5
 * por potencia de 10.
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 2;
  if (value <= 10) return Math.max(2, Math.ceil(value / 2) * 2);
  const base = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (step * base >= value) return step * base;
  }
  return 10 * base;
}

export type Change = { kind: "none" } | { kind: "new" } | { kind: "same" } | { kind: "up" | "down"; percent: number };

/** Variación contra el período anterior; sin datos previos no se inventa un porcentaje. */
export function periodChange(current: number, previous: number, previousHasData: boolean): Change {
  if (!previousHasData) return { kind: "none" };
  if (previous === 0) return current > 0 ? { kind: "new" } : { kind: "same" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "same" };
  return { kind: percent > 0 ? "up" : "down", percent: Math.abs(percent) };
}

function utcDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const dayFormatters = {
  weekday: new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric" }),
  short: new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "numeric", month: "short" }),
  long: new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }),
};

/** Etiquetas de un día "AAAA-MM-DD" (ya expresado en la zona de la sucursal). */
export function dayLabel(dayKey: string, style: keyof typeof dayFormatters): string {
  return dayFormatters[style].format(utcDate(dayKey)).replace(/\.$/, "").replace(/\. /g, " ");
}

/** Cada cuántas columnas se rotula el eje X para que las etiquetas no choquen. */
export function labelEvery(count: number): number {
  if (count <= 8) return 1;
  if (count <= 14) return 2;
  if (count <= 31) return 5;
  if (count <= 62) return 10;
  return 15;
}

export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export function parseRange(value: unknown): StatsRange {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (STATS_RANGES as readonly number[]).includes(n) ? (n as StatsRange) : 30;
}

/**
 * Agrupa una serie diaria en semanas que terminan el último día (la primera
 * puede quedar incompleta). Devuelve el primer y último día de cada grupo.
 */
export function groupByWeek<T extends { day: string; value: number }>(daily: T[]): { from: string; to: string; value: number }[] {
  const groups: { from: string; to: string; value: number }[] = [];
  for (let end = daily.length; end > 0; end -= 7) {
    const slice = daily.slice(Math.max(0, end - 7), end);
    groups.unshift({ from: slice[0].day, to: slice[slice.length - 1].day, value: slice.reduce((sum, d) => sum + d.value, 0) });
  }
  return groups;
}
