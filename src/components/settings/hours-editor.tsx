"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WEEKDAYS, type OpeningInterval } from "@/domain/time";

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursEditor({ value, onChange, disabled }: { value: OpeningInterval[]; onChange: (next: OpeningInterval[]) => void; disabled?: boolean }) {
  const update = (index: number, patch: Partial<OpeningInterval>) => onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const copyToAll = (day: number) => {
    const template = value.filter((v) => v.day === day);
    onChange(ORDER.flatMap((d) => template.map((t) => ({ ...t, day: d }))));
  };
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-semibold">Horarios</legend>
      <p className="-mt-2 text-[13px] text-muted-foreground">
        Si un horario cierra después de medianoche (por ejemplo 20:00 a 01:30), cargalo en el día en que abre.
      </p>
      <ul className="grid gap-2">
        {ORDER.map((day) => {
          const items = value.map((v, index) => ({ ...v, index })).filter((v) => v.day === day);
          return (
            <li key={day} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold capitalize">{WEEKDAYS[day]}</span>
                <span className="flex gap-1">
                  {items.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => copyToAll(day)}>
                      <Copy aria-hidden="true" /> Copiar a todos
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={items.length >= 4}
                    onClick={() => onChange([...value, { day, open: "12:00", close: "16:00" }])}
                  >
                    <Plus aria-hidden="true" /> Horario
                  </Button>
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cerrado</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {items.map((item) => (
                    <li key={item.index} className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">{WEEKDAYS[day]}: abre</span>
                        <input
                          type="time"
                          value={item.open}
                          onChange={(e) => update(item.index, { open: e.target.value })}
                          className="h-11 rounded-lg border border-input bg-card px-3 tabular-nums"
                        />
                      </label>
                      <span aria-hidden="true">a</span>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">{WEEKDAYS[day]}: cierra</span>
                        <input
                          type="time"
                          value={item.close}
                          onChange={(e) => update(item.index, { close: e.target.value })}
                          className="h-11 rounded-lg border border-input bg-card px-3 tabular-nums"
                        />
                      </label>
                      {item.close <= item.open && item.close !== item.open && <span className="text-[13px] text-muted-foreground">(cierra al día siguiente)</span>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar horario del ${WEEKDAYS[day]}`}
                        onClick={() => onChange(value.filter((_, i) => i !== item.index))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
