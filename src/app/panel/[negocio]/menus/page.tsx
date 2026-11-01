import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/states";
import { MenuList } from "@/components/editor/menu-list";
import { MenusTabs } from "@/components/editor/menus-tabs";
import { getBusinessContext } from "@/server/auth";
import { listMenus } from "@/server/queries/menus";

export const metadata: Metadata = { title: "Menús" };

export default function MenusPage(props: PageProps<"/panel/[negocio]/menus">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Menus params={props.params} />
    </Suspense>
  );
}

async function Menus({ params }: { params: PageProps<"/panel/[negocio]/menus">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const menus = await listMenus(ctx);
  return (
    <>
      <PageHeader title="Menús" description="Tus cartas, las sucursales donde se muestran y su estado de publicación." />
      <MenusTabs base={`/panel/${ctx.business.slug}`} current="cartas" />
      <MenuList
        base={`/panel/${ctx.business.slug}`}
        businessId={ctx.business.id}
        menus={menus}
        branches={ctx.branches.map((b) => ({ id: b.id, name: b.name }))}
        canManage={ctx.permissions["menus.manage"] && !ctx.suspended}
      />
    </>
  );
}
