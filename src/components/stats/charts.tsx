import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { niceMax, type Change } from "@/domain/stats";

// Gráficos de una sola serie, renderizados en el servidor con HTML y CSS:
// barras finas (máx. 24 px) con extremo redondeado, 2 px de aire entre barras,
// grilla en línea fina y tooltip al pasar el mouse. Cada gráfico tiene su tabla
// equivalente para lectores de pantalla y teclado.

const number = new Intl.NumberFormat("es-AR");

export function formatCount(value: number) {
  return number.format(value);
}

export function StatTile({ label, value, change, period }: { label: string; value: number; change: Change; period: string }) {
  let delta: ReactNode;
  if (change.kind === "none") delta = <span>Sin datos de los {period} anteriores</span>;
  else if (change.kind === "new") delta = <span>Sin actividad en los {period} anteriores</span>;
  else if (change.kind === "same") delta = (
    <>
      <Minus className="size-3.5" aria-hidden="true" /> Igual que los {period} anteriores
    </>
  );
  else
    delta = (
      <>
        {change.kind === "up" ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : <ArrowDownRight className="size-3.5" aria-hidden="true" />}
        {change.percent} % {change.kind === "up" ? "más" : "menos"} que los {period} anteriores
      </>
    );
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{formatCount(value)}</p>
      <p className="mt-1 flex items-center gap-1 text-[13px] text-muted-foreground">{delta}</p>
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  /** Etiqueta del eje (corta) */
  axisLabel: string;
  /** Etiqueta completa para tooltip y tabla */
  label: string;
  value: number;
}

export function ColumnChart({
  data,
  unit,
  title,
  summary,
  every,
  firstColumn,
  height = 176,
}: {
  data: ColumnDatum[];
  unit: { one: string; many: string };
  title: string;
  summary: string;
  every: number;
  /** Encabezado de la primera columna de la tabla equivalente ("Día", "Hora"…) */
  firstColumn: string;
  height?: number;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceMax(max);
  const peak = data.findIndex((d) => d.value === max && max > 0);
  const ticks = [top, top / 2, 0];
  const unitFor = (v: number) => (v === 1 ? unit.one : unit.many);
  return (
    <figure className="min-w-0">
      <div role="img" aria-label={`${title}. ${summary}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative text-right text-[12px] text-muted-foreground tabular-nums" style={{ height }} aria-hidden="true">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {formatCount(Math.round(t))}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }} aria-hidden="true">
          {ticks.map((t, i) => (
            <div key={t} className="absolute inset-x-0 border-t border-[#ebe8df]" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const pct = d.value > 0 ? Math.max((d.value / top) * 100, 1.5) : 0;
              return (
                <div key={d.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                  <div className="w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80" style={{ height: `${pct}%` }} />
                  {i === peak && (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[12px] font-semibold whitespace-nowrap text-foreground group-hover:invisible"
                      style={{ bottom: `calc(${pct}% + 4px)` }}
                    >
                      {formatCount(d.value)}
                    </span>
                  )}
                  <span
                    className={`pointer-events-none absolute z-10 hidden rounded-md bg-foreground px-2 py-1 text-[12px] whitespace-nowrap text-white shadow-md group-hover:block ${
                      i < data.length / 3 ? "left-0" : i >= (data.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                    }`}
                    style={{ bottom: `calc(${pct}% + 6px)` }}
                  >
                    <strong className="font-semibold">{formatCount(d.value)}</strong> {unitFor(d.value)} · {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <span />
        <div className="mt-1.5 flex gap-[2px] text-[12px] text-muted-foreground" aria-hidden="true">
          {data.map((d, i) => (
            <span
              key={d.key}
              className={`min-w-0 flex-1 whitespace-nowrap ${i === 0 ? "text-left" : i + every > data.length - 1 && every > 1 ? "text-right" : "text-center"}`}
            >
              {i % every === 0 ? d.axisLabel : ""}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">Ver los datos en una tabla</summary>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-card text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {firstColumn}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {unit.many[0].toUpperCase() + unit.many.slice(1)}
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.map((d) => (
                <tr key={d.key} className="border-t border-border">
                  <td className="px-3 py-1.5">{d.label}</td>
                  <td className="px-3 py-1.5 text-right">{formatCount(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function RankedBars({ items, unit }: { items: { key: string; label: string; detail?: string; value: number }[]; unit: { one: string; many: string } }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="grid gap-3">
      {items.map((item, index) => (
        <li key={item.key} className="grid grid-cols-[1.5rem_1fr] items-start gap-2 text-sm">
          <span className="pt-0.5 text-right text-muted-foreground tabular-nums">{index + 1}.</span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-semibold">{item.label}</span>
              <span className="shrink-0 tabular-nums">
                {formatCount(item.value)} <span className="text-muted-foreground">{item.value === 1 ? unit.one : unit.many}</span>
              </span>
            </div>
            {item.detail && <span className="block text-[13px] text-muted-foreground">{item.detail}</span>}
            <div className="mt-1.5 h-2 rounded-full bg-[#f1efe8]" aria-hidden="true">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
