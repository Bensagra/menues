import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartColumn, QrCode, ShieldCheck } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { EmptyState, PageSkeleton, RestrictedState } from "@/components/app/states";
import { ColumnChart, RankedBars, StatTile, formatCount, type ColumnDatum } from "@/components/stats/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATS_RANGES, dayLabel, groupByWeek, labelEvery, parseRange, periodChange } from "@/domain/stats";
import { getBusinessContext } from "@/server/auth";
import { unwrap } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Estadísticas" };

type Props = PageProps<"/panel/[negocio]/estadisticas">;

interface Totals {
  menu_views: number;
  product_views: number;
  searches: number;
}

interface BranchStats {
  timezone: string;
  today: string;
  start: string;
  days: number;
  totals: Totals;
  previous: Totals & { has_data: boolean };
  daily: { day: string; menu_views: number; product_views: number }[];
  hourly: { hour: number; menu_views: number }[];
  top_products: { product_id: string; name: string; category: string | null; archived: boolean; views: number }[];
}

export default function StatsPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Stats params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Stats({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const [{ negocio }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["stats.view"]) return <RestrictedState backHref={base} />;
  const branch = ctx.activeBranch;
  const header = (
    <PageHeader
      title="Estadísticas"
      description="Cuántas personas miran la carta, qué productos abren y a qué hora. Son consultas, no ventas."
    />
  );
  if (!branch) {
    return (
      <>
        {header}
        <EmptyState icon={ChartColumn} title="Todavía no hay sucursales" description="Creá una sucursal para ver sus estadísticas." />
      </>
    );
  }

  const range = parseRange(sp.dias);
  const supabase = await createClient();
  const [statsResult, published] = await Promise.all([
    supabase.rpc("get_branch_stats", { p_branch_id: branch.id, p_days: range }),
    supabase.from("menu_branches").select("menu_id", { count: "exact", head: true }).eq("branch_id", branch.id).not("published_version_id", "is", null),
  ]);
  const stats = unwrap(statsResult, "estadísticas") as unknown as BranchStats;
  const period = `${range} días`;
  const hasAny = stats.totals.menu_views + stats.totals.product_views + stats.totals.searches > 0;

  // Con 90 días, una barra por semana: 90 columnas no se leen (ni entran en un celular).
  const weekly = range === 90;
  const daily: ColumnDatum[] = weekly
    ? groupByWeek(stats.daily.map((d) => ({ day: d.day, value: d.menu_views }))).map((w) => ({
        key: w.from,
        axisLabel: dayLabel(w.from, "short"),
        label: w.from === w.to ? dayLabel(w.from, "long") : `Del ${dayLabel(w.from, "long")} al ${dayLabel(w.to, "long")}`,
        value: w.value,
      }))
    : stats.daily.map((d) => ({
        key: d.day,
        axisLabel: dayLabel(d.day, range === 7 ? "weekday" : "short"),
        label: dayLabel(d.day, "long"),
        value: d.menu_views,
      }));
  const hourly: ColumnDatum[] = stats.hourly.map((h) => ({
    key: String(h.hour),
    axisLabel: `${h.hour} h`,
    label: `De ${String(h.hour).padStart(2, "0")}:00 a ${String(h.hour).padStart(2, "0")}:59`,
    value: h.menu_views,
  }));
  const busiestDay = daily.reduce<ColumnDatum | null>((best, d) => (d.value > (best?.value ?? 0) ? d : best), null);
  const busiestHour = hourly.reduce<ColumnDatum | null>((best, h) => (h.value > (best?.value ?? 0) ? h : best), null);

  return (
    <>
      {header}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Período" className="inline-flex rounded-lg border border-border bg-card p-1">
          {STATS_RANGES.map((r) => (
            <Link
              key={r}
              href={`${base}/estadisticas?dias=${r}`}
              aria-current={r === range ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold ${
                r === range ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r} días
            </Link>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          Sucursal <strong className="text-foreground">{branch.name}</strong> · horario de {stats.timezone.replace(/_/g, " ")}
        </p>
      </div>

      {(published.count ?? 0) === 0 && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning-surface p-4 text-sm text-warning">
          Esta sucursal todavía no tiene una carta publicada: las visitas empiezan a contarse cuando la publiques.
        </p>
      )}

      {!hasAny ? (
        <EmptyState
          icon={ChartColumn}
          title={`Sin visitas en los últimos ${period}`}
          description="Cuando alguien abra la carta desde el QR o el enlace, vas a ver acá cuántas visitas tuvo y qué productos se consultaron."
        >
          <Button asChild variant="outline">
            <Link href={`${base}/qr`}>
              <QrCode aria-hidden="true" /> Ir a QR y difusión
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Visitas a la carta"
              value={stats.totals.menu_views}
              change={periodChange(stats.totals.menu_views, stats.previous.menu_views, stats.previous.has_data)}
              period={period}
            />
            <StatTile
              label="Consultas de productos"
              value={stats.totals.product_views}
              change={periodChange(stats.totals.product_views, stats.previous.product_views, stats.previous.has_data)}
              period={period}
            />
            <StatTile
              label="Búsquedas"
              value={stats.totals.searches}
              change={periodChange(stats.totals.searches, stats.previous.searches, stats.previous.has_data)}
              period={period}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-labelledby="visitas-dia" className="min-w-0 rounded-xl border border-border bg-card p-5 xl:col-span-2">
              <SectionTitle description="Una visita es una persona que abre la carta; si la vuelve a abrir en la misma pestaña, no se cuenta de nuevo.">
                <span id="visitas-dia">{weekly ? "Visitas por semana" : "Visitas por día"}</span>
              </SectionTitle>
              <ColumnChart
                data={daily}
                unit={{ one: "visita", many: "visitas" }}
                title={weekly ? "Visitas por semana" : "Visitas por día"}
                firstColumn={weekly ? "Semana" : "Día"}
                summary={
                  busiestDay
                    ? `Total ${formatCount(stats.totals.menu_views)} visitas. ${weekly ? "La semana" : "El día"} con más visitas fue ${weekly ? busiestDay.label.toLowerCase() : `el ${busiestDay.label}`}, con ${formatCount(busiestDay.value)}.`
                    : "Sin visitas en el período."
                }
                every={labelEvery(daily.length)}
              />
            </section>

            <section aria-labelledby="visitas-hora" className="min-w-0 rounded-xl border border-border bg-card p-5">
              <SectionTitle description="Suma de visitas del período según la hora en que se abrió la carta.">
                <span id="visitas-hora">¿A qué hora miran la carta?</span>
              </SectionTitle>
              <ColumnChart
                data={hourly}
                unit={{ one: "visita", many: "visitas" }}
                title="Visitas por hora del día"
                firstColumn="Hora"
                summary={busiestHour ? `La franja con más visitas es ${busiestHour.label.toLowerCase()}, con ${formatCount(busiestHour.value)}.` : "Sin visitas."}
                every={3}
              />
            </section>

            <section aria-labelledby="productos" className="min-w-0 rounded-xl border border-border bg-card p-5">
              <SectionTitle description="Productos que más se abrieron para ver el detalle. Indican interés, no ventas.">
                <span id="productos">Productos más consultados</span>
              </SectionTitle>
              {stats.top_products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía nadie abrió el detalle de un producto en este período.</p>
              ) : (
                <RankedBars
                  unit={{ one: "consulta", many: "consultas" }}
                  items={stats.top_products.map((p) => ({
                    key: p.product_id,
                    label: p.name,
                    detail: [p.category, p.archived ? "archivado" : null].filter(Boolean).join(" · ") || undefined,
                    value: p.views,
                  }))}
                />
              )}
            </section>
          </div>
        </>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          No guardamos datos personales de quienes miran la carta: ni IP, ni cookies de seguimiento, solo conteos por hora. No se cuentan las visitas
          de tu equipo cuando tiene la sesión iniciada, ni las de buscadores y vistas previas de enlaces.{" "}
          <Badge variant="muted" className="align-middle">
            Datos desde {dayLabel(stats.start, "short")}
          </Badge>
        </span>
      </p>
    </>
  );
}
