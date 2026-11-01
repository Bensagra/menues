import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/states";
import { MenuEditor } from "@/components/editor/menu-editor";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { getMenuEditorData } from "@/server/queries/menus";

export const metadata: Metadata = { title: "Editar carta" };

export default function MenuEditorPage(props: PageProps<"/panel/[negocio]/menus/[menuId]">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Editor params={props.params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/panel/[negocio]/menus/[menuId]">["params"] }) {
  const { negocio, menuId } = await params;
  const ctx = await getBusinessContext(negocio);
  const data = await getMenuEditorData(ctx, menuId);
  const branchSlugs = Object.fromEntries(ctx.branches.map((b) => [b.id, b.public_slug]));
  return (
    <MenuEditor
      data={data}
      appUrl={publicEnv().appUrl}
      branchSlugs={branchSlugs}
      allBranches={ctx.branches.map((b) => ({ id: b.id, name: b.name }))}
      env={{
        base: `/panel/${ctx.business.slug}`,
        businessId: ctx.business.id,
        currency: ctx.business.currency,
        locale: ctx.business.locale,
        menuId: data.menu.id,
        canEditContent: data.canEditContent && data.menu.status === "active" && ctx.permissions["catalog.edit"],
        canPublish: ctx.permissions["catalog.publish"],
        canManage: ctx.permissions["menus.manage"],
        readOnly: ctx.suspended || data.menu.status === "archived",
        branches: data.menuBranches,
      }}
    />
  );
}
