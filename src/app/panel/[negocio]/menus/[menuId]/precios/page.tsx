import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { BulkPriceTool } from "@/components/prices/bulk-price-tool";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleAlert } from "lucide-react";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { getMenuEditorData } from "@/server/queries/menus";

export const metadata: Metadata = { title: "Precios masivos" };

type Props = PageProps<"/panel/[negocio]/menus/[menuId]/precios">;

export default function BulkPricesPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <BulkPrices params={props.params} />
    </Suspense>
  );
}

async function BulkPrices({ params }: { params: Props["params"] }) {
  const { negocio, menuId } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["catalog.edit"]) return <RestrictedState backHref={`${base}/menus`} />;
  const data = await getMenuEditorData(ctx, menuId);
  const header = (
    <PageHeader
      back={{ href: `${base}/menus/${data.menu.id}`, label: data.menu.name }}
      title="Precios masivos"
      description="Subí o bajá precios por porcentaje o importe, con redondeo, en toda la carta o en algunas categorías. Primero ves la vista previa."
    />
  );
  if (ctx.suspended || data.menu.status !== "active") {
    return (
      <>
        {header}
        <Alert variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            {ctx.suspended ? "La cuenta está suspendida: no se pueden cambiar precios." : "Esta carta está archivada. Restaurala para cambiar precios."}
          </AlertDescription>
        </Alert>
      </>
    );
  }
  const accessible = data.menuBranches.filter((b) => b.accessible);
  const slugs = new Map(ctx.branches.map((b) => [b.id, b.public_slug]));
  const productsByCategory = new Map<string, number>();
  for (const p of data.products) if (!p.archived_at) productsByCategory.set(p.category_id, (productsByCategory.get(p.category_id) ?? 0) + 1);
  return (
    <>
      {header}
      {accessible.length === 0 ? (
        <RestrictedState description="Esta carta no se usa en ninguna de tus sucursales." backHref={`${base}/menus/${data.menu.id}`} />
      ) : (
        <BulkPriceTool
          env={{
            base,
            appUrl: publicEnv().appUrl,
            menuId: data.menu.id,
            menuName: data.menu.name,
            currency: ctx.business.currency,
            locale: ctx.business.locale,
            categories: data.categories.map((c) => ({ id: c.id, name: c.name, products: productsByCategory.get(c.id) ?? 0 })),
            branches: accessible.map((b) => ({ id: b.id, name: b.name, slug: slugs.get(b.id) ?? "" })),
            canEditBase: data.canEditContent,
            canPublish: ctx.permissions["catalog.publish"],
          }}
        />
      )}
    </>
  );
}
