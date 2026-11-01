import { localParts, timeToMinutes } from "./time";

// Estado de una promoción o menú del día según la hora local de la sucursal.
// Se calcula siempre con la hora actual: nunca se guarda.

export interface PromotionSchedule {
  starts_on: string; // AAAA-MM-DD, inclusive
  ends_on: string; // AAAA-MM-DD, inclusive
  weekdays: number[]; // 0 = domingo
  start_time: string; // HH:MM
  end_time: string; // HH:MM (posterior a start_time)
  paused?: boolean;
}

export type PromotionState =
  | { kind: "paused" }
  | { kind: "active"; until: string }
  | { kind: "scheduled"; next: { date: string; time: string; today: boolean } }
  | { kind: "ended" };

const DAY_MS = 86_400_000;

function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function promotionState(schedule: PromotionSchedule, now: Date, timeZone: string): PromotionState {
  if (schedule.paused) return { kind: "paused" };
  const local = localParts(now, timeZone);
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  const days = new Set(schedule.weekdays);
  const today = local.dateKey;
  const inRange = today >= schedule.starts_on && today <= schedule.ends_on;
  if (inRange && days.has(local.weekday) && local.minutes >= start && local.minutes < end) {
    return { kind: "active", until: schedule.end_time };
  }
  // Próxima fecha: hoy más tarde o algún día siguiente dentro del período.
  const from = Math.max(keyToUtc(today), keyToUtc(schedule.starts_on));
  const last = keyToUtc(schedule.ends_on);
  for (let ms = from, i = 0; ms <= last && i < 8; ms += DAY_MS, i++) {
    const key = utcToKey(ms);
    const weekday = new Date(ms).getUTCDay();
    if (!days.has(weekday)) continue;
    if (key === today && local.minutes >= start) continue;
    return { kind: "scheduled", next: { date: key, time: schedule.start_time, today: key === today } };
  }
  return { kind: "ended" };
}

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const LONG = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** "todos los días", "de lunes a viernes", "lun, mié y vie". */
export function describeWeekdays(weekdays: number[]): string {
  const set = new Set(weekdays);
  if (set.size === 7) return "todos los días";
  const ordered = WEEKDAY_ORDER.filter((d) => set.has(d));
  const key = ordered.join(",");
  if (key === "1,2,3,4,5") return "de lunes a viernes";
  if (key === "6,0") return "sábados y domingos";
  if (key === "1,2,3,4,5,6") return "de lunes a sábado";
  if (ordered.length === 1) return `los ${LONG[ordered[0]]}`;
  const names = ordered.map((d) => SHORT[d]);
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** "16" para 16:00, "19:30" para 19:30 (se usa con "h"). */
export function shortTime(t: string): string {
  return t.endsWith(":00") ? String(Number(t.slice(0, 2))) : t.replace(/^0/, "");
}

export function describeHours(start: string, end: string): string {
  if (start === "00:00" && end === "23:59") return "todo el día";
  return `de ${shortTime(start)} a ${shortTime(end)} h`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "El 3 de noviembre", "Del 2 al 6 de noviembre", "Del 28 de octubre al 3 de noviembre". */
export function describePeriod(startsOn: string, endsOn: string): string {
  const [, sm, sd] = startsOn.split("-").map(Number);
  const [, em, ed] = endsOn.split("-").map(Number);
  const sy = startsOn.slice(0, 4);
  const ey = endsOn.slice(0, 4);
  if (startsOn === endsOn) return `El ${sd} de ${MONTHS[sm - 1]}`;
  if (sy === ey && sm === em) return `Del ${sd} al ${ed} de ${MONTHS[em - 1]}`;
  if (sy === ey) return `Del ${sd} de ${MONTHS[sm - 1]} al ${ed} de ${MONTHS[em - 1]}`;
  return `Del ${sd} de ${MONTHS[sm - 1]} de ${sy} al ${ed} de ${MONTHS[em - 1]} de ${ey}`;
}
