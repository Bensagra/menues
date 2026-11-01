import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { SettingsNav } from "@/components/settings/settings-nav";
import { formatDate } from "@/domain/time";
import { getBusinessContext } from "@/server/auth";
import { unwrap } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Plan" };

interface Overview {
  plan: { name: string; description: string; max_branches: number; max_members: number; max_menus: number; ai_pages_per_month: number; ai_max_pages_per_import: number };
  assigned_at: string | null;
  branches: number;
  members: number;
  open_invitations: number;
  menus: number;
  ai: { used: number; reserved: number; remaining: number; limit: number; month: string };
}

function Usage({ label, used, limit, note }: { label: string; used: number; limit: number; note?: string }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {used} <span className="text-base font-medium text-muted-foreground">de {limit}</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ebe8df]" role="img" aria-label={`${used} de ${limit} usados`}>
        <div className={ratio >= 1 ? "h-full bg-warning" : "h-full bg-primary"} style={{ width: `${ratio * 100}%` }} />
      </div>
      {note && <p className="mt-2 text-[13px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function PlanPage(props: PageProps<"/panel/[negocio]/configuracion/plan">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Plan params={props.params} />
    </Suspense>
  );
}

async function Plan({ params }: { params: PageProps<"/panel/[negocio]/configuracion/plan">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["plan.view"]) return <RestrictedState backHref={base} />;
  const supabase = await createClient();
  const overview = unwrap(await supabase.rpc("get_plan_overview", { p_business_id: ctx.business.id }), "plan") as unknown as Overview;
  const tz = ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires";
  return (
    <>
      <PageHeader title="Configuración" description="Datos del local, sucursales, equipo y plan." />
      <SettingsNav base={base} current="plan" permissions={ctx.permissions} />
      <section aria-labelledby="plan-actual" className="mb-6 rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-muted-foreground">Plan actual</p>
        <h2 id="plan-actual" className="font-display text-3xl font-semibold">
          {overview.plan.name}
        </h2>
        {overview.plan.description && <p className="mt-1 text-muted-foreground">{overview.plan.description}</p>}
        {overview.assigned_at && <p className="mt-2 text-sm text-muted-foreground">Asignado el {formatDate(overview.assigned_at, tz)}.</p>}
        <p className="mt-3 text-sm">
          Los planes se asignan a mano por ahora: no hay cobros automáticos. Para cambiar de plan, escribinos.
        </p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Usage
          label="Fotos procesadas este mes"
          used={overview.ai.used + overview.ai.reserved}
          limit={overview.ai.limit}
          note={`Hasta ${overview.plan.ai_max_pages_per_import} fotos por importación.${overview.ai.reserved ? ` ${overview.ai.reserved} en proceso.` : ""} Las importaciones fallidas o canceladas no consumen.`}
        />
        <Usage label="Sucursales" used={overview.branches} limit={overview.plan.max_branches} />
        <Usage label="Personas en el equipo" used={overview.members + overview.open_invitations} limit={overview.plan.max_members} note="Incluye invitaciones abiertas." />
        <Usage label="Cartas activas" used={overview.menus} limit={overview.plan.max_menus} />
      </div>
    </>
  );
}
