import { describe, expect, it } from "vitest";
import { describeHours, describePeriod, describeWeekdays, promotionState, type PromotionSchedule } from "@/domain/promotions";

const TZ = "America/Argentina/Buenos_Aires"; // UTC-3, sin horario de verano
const at = (local: string) => new Date(`${local}:00-03:00`);

const lunch: PromotionSchedule = {
  starts_on: "2026-11-02",
  ends_on: "2026-11-06",
  weekdays: [1, 2, 3, 4, 5],
  start_time: "12:00",
  end_time: "16:00",
};

describe("estado de promociones", () => {
  it("está programada antes de empezar, con la próxima fecha", () => {
    expect(promotionState(lunch, at("2026-10-30T10:00"), TZ)).toEqual({
      kind: "scheduled",
      next: { date: "2026-11-02", time: "12:00", today: false },
    });
  });

  it("está activa dentro de la franja y vuelve a programada fuera de ella", () => {
    expect(promotionState(lunch, at("2026-11-03T13:30"), TZ)).toEqual({ kind: "active", until: "16:00" });
    expect(promotionState(lunch, at("2026-11-03T09:00"), TZ)).toEqual({
      kind: "scheduled",
      next: { date: "2026-11-03", time: "12:00", today: true },
    });
    expect(promotionState(lunch, at("2026-11-03T16:00"), TZ)).toEqual({
      kind: "scheduled",
      next: { date: "2026-11-04", time: "12:00", today: false },
    });
  });

  it("usa la hora local de la sucursal, no la del servidor", () => {
    // 15:30 UTC = 12:30 en Buenos Aires: activa. En Madrid (UTC+1) son las 16:30: ya terminó la franja.
    const instant = new Date("2026-11-03T15:30:00Z");
    expect(promotionState(lunch, instant, TZ).kind).toBe("active");
    expect(promotionState(lunch, instant, "Europe/Madrid").kind).toBe("scheduled");
  });

  it("termina después de la última fecha válida", () => {
    expect(promotionState(lunch, at("2026-11-06T16:30"), TZ)).toEqual({ kind: "ended" });
    // El 7 y el 8 son fin de semana: después del viernes no queda ninguna fecha.
    expect(promotionState({ ...lunch, ends_on: "2026-11-08" }, at("2026-11-06T17:00"), TZ)).toEqual({ kind: "ended" });
  });

  it("una promoción pausada no se muestra aunque esté en horario", () => {
    expect(promotionState({ ...lunch, paused: true }, at("2026-11-03T13:30"), TZ)).toEqual({ kind: "paused" });
  });
});

describe("textos de la programación", () => {
  it("describe días y horarios en lenguaje natural", () => {
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe("de lunes a viernes");
    expect(describeWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe("todos los días");
    expect(describeWeekdays([5])).toBe("los viernes");
    expect(describeWeekdays([1, 3, 5])).toBe("lun, mié y vie");
    expect(describeHours("12:00", "16:00")).toBe("de 12 a 16 h");
    expect(describeHours("19:30", "21:00")).toBe("de 19:30 a 21 h");
    expect(describeHours("00:00", "23:59")).toBe("todo el día");
    expect(describePeriod("2026-11-03", "2026-11-03")).toBe("El 3 de noviembre");
    expect(describePeriod("2026-11-02", "2026-11-06")).toBe("Del 2 al 6 de noviembre");
    expect(describePeriod("2026-10-28", "2026-11-03")).toBe("Del 28 de octubre al 3 de noviembre");
    expect(describePeriod("2026-12-28", "2027-01-03")).toBe("Del 28 de diciembre de 2026 al 3 de enero de 2027");
  });
});
