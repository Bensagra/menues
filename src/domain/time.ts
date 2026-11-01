// Fechas: se guardan en UTC y se muestran en la zona horaria de la sucursal.

export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
export const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

export interface OpeningInterval {
  day: number; // 0 = domingo
  open: string; // HH:MM
  close: string; // HH:MM; menor que open = cierra después de medianoche
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function supportedTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [DEFAULT_TIMEZONE];
  return zones.includes(DEFAULT_TIMEZONE) ? zones : [DEFAULT_TIMEZONE, ...zones];
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
  dateKey: string;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function localParts(date: Date, timeZone: string): LocalParts {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export type OpenStatus =
  | { state: "unknown" }
  | { state: "open"; closesAt: string }
  | { state: "closed"; opensAt: string | null; opensDay: "today" | "tomorrow" | number | null };

/** Estado de apertura en la zona horaria del local. Contempla horarios después de medianoche. */
export function openStatus(hours: OpeningInterval[], now: Date, timeZone: string): OpenStatus {
  if (!hours.length) return { state: "unknown" };
  const { weekday, minutes } = localParts(now, timeZone);
  const yesterday = (weekday + 6) % 7;

  for (const interval of hours) {
    const open = timeToMinutes(interval.open);
    const close = timeToMinutes(interval.close);
    const overnight = close <= open;
    if (interval.day === weekday && minutes >= open && (overnight || minutes < close)) {
      return { state: "open", closesAt: interval.close };
    }
    if (overnight && interval.day === yesterday && minutes < close) {
      return { state: "open", closesAt: interval.close };
    }
  }

  for (let offset = 0; offset < 7; offset++) {
    const day = (weekday + offset) % 7;
    const candidates = hours
      .filter((interval) => interval.day === day)
      .map((interval) => timeToMinutes(interval.open))
      .filter((open) => offset > 0 || open > minutes)
      .sort((a, b) => a - b);
    if (candidates.length) {
      return {
        state: "closed",
        opensAt: minutesToTime(candidates[0]),
        opensDay: offset === 0 ? "today" : offset === 1 ? "tomorrow" : day,
      };
    }
  }
  return { state: "closed", opensAt: null, opensDay: null };
}

export function describeOpenStatus(status: OpenStatus): string {
  if (status.state === "unknown") return "";
  if (status.state === "open") return `Abierto · cierra a las ${status.closesAt}`;
  if (!status.opensAt) return "Cerrado";
  if (status.opensDay === "today") return `Cerrado · abre hoy a las ${status.opensAt}`;
  if (status.opensDay === "tomorrow") return `Cerrado · abre mañana a las ${status.opensAt}`;
  return `Cerrado · abre el ${WEEKDAYS[status.opensDay as number]} a las ${status.opensAt}`;
}

/** Agrupa los horarios por día para mostrarlos ("lunes: 12:00–16:00, 20:00–00:30"). */
export function hoursByDay(hours: OpeningInterval[]): { day: number; label: string; ranges: string[] }[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((day) => ({
    day,
    label: WEEKDAYS[day],
    ranges: hours
      .filter((interval) => interval.day === day)
      .sort((a, b) => timeToMinutes(a.open) - timeToMinutes(b.open))
      .map((interval) => `${interval.open}–${interval.close}`),
  }));
}

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function formatDateTime(
  value: string | Date,
  timeZone: string,
  locale = "es-AR",
  style: "short" | "long" = "short",
): string {
  const key = `${timeZone}|${locale}|${style}`;
  let formatter = dateTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "numeric",
      month: style === "long" ? "long" : "short",
      year: style === "long" ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dateTimeFormatterCache.set(key, formatter);
  }
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: string | Date, timeZone: string, locale = "es-AR"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "long", year: "numeric" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** Tiempo relativo breve ("hace 5 min"), útil para estados de procesamiento. */
export function formatRelative(value: string | Date, now = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/**
 * Convierte una fecha y hora local de una zona ("2026-11-01", "12:00") al
 * instante UTC correspondiente. Resuelve el desfase iterando sobre Intl, lo que
 * respeta cambios de horario de verano.
 */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = localParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(parts.minutes / 60), parts.minutes % 60);
    guess += target - asUtc;
  }
  return new Date(guess);
}
