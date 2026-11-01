import "server-only";
import { notFound } from "next/navigation";
import type { BusinessContext } from "@/server/auth";
import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";
import { profileNames, unwrap } from "./common";

export async function getUploadData(ctx: BusinessContext) {
  const supabase = await createClient();
  const [menus, quota, recent] = await Promise.all([
    supabase
      .from("menus")
      .select("id, name, menu_branches(branch_id), categories(id, name, sort_order)")
      .eq("business_id", ctx.business.id)
      .eq("status", "active")
      .order("sort_order"),
    supabase.rpc("get_ai_quota", { p_business_id: ctx.business.id }),
    supabase
      .from("imports")
      .select("id, status, stage, scope, page_count, created_at, summary, provider, menus(name)")
      .eq("business_id", ctx.business.id)
      .neq("status", "uploading")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const menuRows = unwrap(menus, "cartas");
  return {
    menus: menuRows.map((m) => ({
      id: m.id,
      name: m.name,
      branchIds: (m.menu_branches ?? []).map((mb) => mb.branch_id).filter((id) => ctx.branches.some((b) => b.id === id)),
      categories: [...(m.categories ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((c) => ({ id: c.id, name: c.name })),
    })),
    quota: unwrap(quota, "cuota") as unknown as {
      limit: number;
      used: number;
      reserved: number;
      remaining: number;
      max_pages_per_import: number;
      plan_name: string;
    },
    recent: unwrap(recent, "importaciones"),
  };
}

export interface ReviewProposal {
  id: string;
  position: number;
  kind: string;
  status: "pending" | "approved" | "rejected" | "applied" | "conflict" | "skipped";
  needs_review: boolean;
  applicable: boolean;
  product_id: string | null;
  category_id: string | null;
  new_category_ref: string | null;
  page_number: number | null;
  current_value: Record<string, unknown> | null;
  detected_value: Record<string, unknown>;
  proposed_value: Record<string, unknown> | null;
  flags: string[];
  reason: string;
  corrected: boolean;
}

export async function getImportDetail(ctx: BusinessContext, importId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(importId)) notFound();
  const supabase = await createClient();
  const importResult = await supabase
    .from("imports")
    .select("*, menus(id, name)")
    .eq("id", importId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (importResult.error) unwrap(importResult, "importación");
  const imp = importResult.data;
  if (!imp) notFound();

  const [images, proposals, branches, categories] = await Promise.all([
    supabase.from("import_images").select("id, page_number, storage_path, rotation, width, height, status").eq("import_id", importId).order("page_number"),
    supabase.from("import_proposals").select("*").eq("import_id", importId).order("position"),
    supabase.from("import_branches").select("branch_id").eq("import_id", importId),
    supabase.from("categories").select("id, name").eq("menu_id", imp.menu_id).order("sort_order"),
  ]);
  const imageRows = unwrap(images, "fotos");

  // Las fotos originales son privadas: se muestran con URLs firmadas de corta duración.
  const admin = createAdminClient();
  const signed = imageRows.length
    ? await admin.storage.from("import-originals").createSignedUrls(
        imageRows.map((i) => i.storage_path),
        60 * 60,
      )
    : { data: [], error: null };
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const names = await profileNames(supabase, [imp.created_by, imp.applied_by]);

  return {
    import: imp,
    menuName: (imp.menus as unknown as { name: string } | null)?.name ?? "Carta",
    createdByName: names.get(imp.created_by) ?? null,
    images: imageRows.map((i) => ({ ...i, url: urls.get(i.storage_path) ?? null })),
    proposals: unwrap(proposals, "propuestas") as unknown as ReviewProposal[],
    branchIds: unwrap(branches, "sucursales").map((b) => b.branch_id),
    categories: unwrap(categories, "categorías"),
  };
}

export type ImportDetail = Awaited<ReturnType<typeof getImportDetail>>;
