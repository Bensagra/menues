import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { BusinessSettingsForm } from "@/components/settings/business-form";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SETTINGS_NAV } from "@/components/panel/nav";
import { publicMediaUrl } from "@/lib/media-url";
import { getBusinessContext } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Configuración del local" };

export default function SettingsPage(props: PageProps<"/panel/[negocio]/configuracion">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Settings params={props.params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: PageProps<"/panel/[negocio]/configuracion">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["business.update"]) {
    const first = SETTINGS_NAV.find((item) => ctx.permissions[item.permission]);
    if (first) redirect(first.href(base));
    return <RestrictedState backHref={base} />;
  }
  const supabase = await createClient();
  const [{ data: business }, { count }] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, name, description, currency, locale, brand_color, logo:media!businesses_logo_fk(path_sm), cover:media!businesses_cover_fk(path_lg)")
      .eq("id", ctx.business.id)
      .single(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).not("price_minor", "is", null),
  ]);
  if (!business) return <RestrictedState backHref={base} />;
  return (
    <>
      <PageHeader title="Configuración" description="Datos del local, sucursales, equipo y plan." />
      <SettingsNav base={base} current="local" permissions={ctx.permissions} />
      <BusinessSettingsForm
        readOnly={ctx.suspended}
        hasPrices={(count ?? 0) > 0}
        business={{
          id: business.id,
          name: business.name,
          description: business.description,
          currency: business.currency,
          locale: business.locale,
          brand_color: business.brand_color,
          logoUrl: publicMediaUrl((business.logo as unknown as { path_sm: string } | null)?.path_sm),
          coverUrl: publicMediaUrl((business.cover as unknown as { path_lg: string } | null)?.path_lg),
        }}
      />
    </>
  );
}
