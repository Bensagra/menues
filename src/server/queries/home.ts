import "server-only";
import type { BusinessContext } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { profileNames } from "./common";

export interface HomeMenuStatus {
  menuId: string;
  name: string;
  hasChanges: boolean;
  versionNumber: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  draftProductCount: number;
  publishedProductCount: number | null;
}

export async function getHomeData(ctx: BusinessContext) {
  const supabase = await createClient();
  const branchId = ctx.activeBranch?.id ?? null;

  const { data: links } = branchId
    ? await supabase
        .from("menu_branches")
        .select("menu_id, sort_order, menus!inner(id, name, status)")
        .eq("branch_id", branchId)
        .eq("menus.status", "active")
        .order("sort_order")
    : { data: [] as never[] };

  const menus: HomeMenuStatus[] = [];
  for (const link of links ?? []) {
    const menu = link.menus as unknown as { id: string; name: string };
    const { data: status } = await supabase.rpc("get_menu_publish_status", { p_menu_id: menu.id });
    const row = (status ?? []).find((s) => s.branch_id === branchId);
    menus.push({
      menuId: menu.id,
      name: menu.name,
      hasChanges: Boolean(row?.has_changes),
      versionNumber: row?.version_number ?? null,
      publishedAt: row?.published_at ?? null,
      publishedBy: null,
      draftProductCount: row?.draft_product_count ?? 0,
      publishedProductCount: row?.published_product_count ?? null,
    });
  }

  // Quién publicó por última vez cada menú en esta sucursal.
  if (branchId && menus.length) {
    const { data: versions } = await supabase
      .from("menu_versions")
      .select("menu_id, version_number, publications!menu_versions_business_id_publication_id_fkey!inner(published_by)")
      .eq("branch_id", branchId)
      .in(
        "menu_id",
        menus.map((m) => m.menuId),
      )
      .order("version_number", { ascending: false });
    const latest = new Map<string, string | null>();
    for (const v of versions ?? []) {
      if (!latest.has(v.menu_id)) latest.set(v.menu_id, (v.publications as unknown as { published_by: string | null }).published_by);
    }
    const names = await profileNames(supabase, [...latest.values()]);
    for (const m of menus) {
      const by = latest.get(m.menuId);
      m.publishedBy = by ? (names.get(by) ?? null) : null;
    }
  }

  const [{ data: imports }, { count: anyProducts }] = await Promise.all([
    supabase
      .from("imports")
      .select("id, status, stage, created_at, page_count, summary, menu_id")
      .eq("business_id", ctx.business.id)
      .in("status", ["pending", "processing", "needs_review", "failed"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).is("archived_at", null),
  ]);

  return {
    menus,
    imports: imports ?? [],
    hasProducts: (anyProducts ?? 0) > 0,
    hasPublished: menus.some((m) => m.versionNumber !== null),
  };
}
