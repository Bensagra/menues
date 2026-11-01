import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { BranchesManager, type BranchRow } from "@/components/settings/branches-manager";
import { SettingsNav } from "@/components/settings/settings-nav";
import { supportedTimezones } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { unwrap } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Sucursales" };

export default function BranchesPage(props: PageProps<"/panel/[negocio]/configuracion/sucursales">) {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <Branches params={props.params} />
    </Suspense>
  );
}

async function Branches({ params }: { params: PageProps<"/panel/[negocio]/configuracion/sucursales">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["branches.manage"]) return <RestrictedState backHref={base} />;
  const supabase = await createClient();
  const [branches, plan] = await Promise.all([
    supabase.from("branches").select("id, name, public_slug, timezone, address, phone, whatsapp, public_note, opening_hours, is_active").eq("business_id", ctx.business.id).order("sort_order").order("name"),
    supabase.rpc("get_plan_overview", { p_business_id: ctx.business.id }),
  ]);
  const overview = unwrap(plan, "plan") as unknown as { plan: { max_branches: number } };
  return (
    <>
      <PageHeader title="Configuración" description="Datos del local, sucursales, equipo y plan." />
      <SettingsNav base={base} current="sucursales" permissions={ctx.permissions} />
      <BranchesManager
        businessId={ctx.business.id}
        businessSlug={ctx.business.slug}
        branches={unwrap(branches, "sucursales") as unknown as BranchRow[]}
        timezones={supportedTimezones()}
        appUrl={publicEnv().appUrl}
        limit={overview.plan.max_branches}
        readOnly={ctx.suspended}
      />
    </>
  );
}
