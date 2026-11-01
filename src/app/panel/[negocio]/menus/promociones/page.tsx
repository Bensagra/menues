import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/states";
import { MenusTabs } from "@/components/editor/menus-tabs";
import { PromotionsManager, type PromotionRow } from "@/components/promotions/promotions-manager";
import { promotionState } from "@/domain/promotions";
import { localParts } from "@/domain/time";
import { getBusinessContext } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { unwrap } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Menú del día y promociones" };

type Props = PageProps<"/panel/[negocio]/menus/promociones">;

type Raw = Omit<PromotionRow, "states" | "editable">;

export default function PromotionsPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Promotions params={props.params} />
    </Suspense>
  );
}

async function Promotions({ params }: { params: Props["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  const supabase = await createClient();
  const [result, now] = await Promise.all([supabase.rpc("list_promotions", { p_business_id: ctx.business.id }), requestTime()]);
  const raw = unwrap(result, "promociones") as unknown as Raw[];
  const branchById = new Map(ctx.branches.map((b) => [b.id, b]));
  const scopeIds = new Set(ctx.scope.allBranches ? ctx.branches.map((b) => b.id) : ctx.scope.branchIds);
  const rows: PromotionRow[] = raw.map((p) => ({
    ...p,
    states: p.branch_ids
      .filter((id) => branchById.has(id))
      .map((id) => ({ branchId: id, state: promotionState(p, new Date(now), branchById.get(id)!.timezone) })),
    editable: ctx.scope.allBranches || p.branch_ids.every((id) => scopeIds.has(id)),
  }));
  const tz = ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires";
  return (
    <>
      <PageHeader title="Menús" description="Tus cartas, las sucursales donde se muestran y su estado de publicación." />
      <MenusTabs base={base} current="promociones" />
      <PromotionsManager
        rows={rows}
        env={{
          businessId: ctx.business.id,
          currency: ctx.business.currency,
          locale: ctx.business.locale,
          today: localParts(new Date(now), tz).dateKey,
          defaultBranchId: ctx.activeBranch?.id ?? null,
          branches: ctx.branches.map((b) => ({ id: b.id, name: b.name })),
          canManage: ctx.permissions["promotions.manage"] && !ctx.suspended,
        }}
      />
    </>
  );
}
