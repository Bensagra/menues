import "server-only";
import { notFound } from "next/navigation";
import type { BusinessContext } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { profileNames, unwrap } from "./common";

export interface HistoryEntry {
  type: "publication" | "import";
  id: string;
  at: string;
  userName: string | null;
  menuName: string;
  menuId: string;
  source: string;
  branchIds: string[];
  status: string;
  versions: { id: string; branchId: string; versionNumber: number; summary: Record<string, unknown>; current: boolean }[];
  importSummary: Record<string, unknown> | null;
  provider: string | null;
  pageCount: number | null;
}

export async function listHistory(ctx: BusinessContext, filters: { type: "todo" | "publicaciones" | "importaciones"; branchId: string | null; before: string | null }) {
  const supabase = await createClient();
  const limit = 30;
  const before = filters.before ?? new Date(Date.now() + 60_000).toISOString();

  const [pubs, imps, current] = await Promise.all([
    filters.type === "importaciones"
      ? { data: [], error: null }
      : supabase
          .from("publications")
          .select(
            "id, menu_id, source, published_by, published_at, import_id, menus(name), menu_versions!menu_versions_business_id_publication_id_fkey(id, branch_id, version_number, change_summary)",
          )
          .eq("business_id", ctx.business.id)
          .lt("published_at", before)
          .order("published_at", { ascending: false })
          .limit(limit),
    filters.type === "publicaciones"
      ? { data: [], error: null }
      : supabase
          .from("imports")
          .select("id, status, stage, scope, created_at, created_by, page_count, summary, provider, menu_id, menus(name), import_branches(branch_id)")
          .eq("business_id", ctx.business.id)
          .neq("status", "uploading")
          .lt("created_at", before)
          .order("created_at", { ascending: false })
          .limit(limit),
    supabase.from("menu_branches").select("published_version_id").eq("business_id", ctx.business.id).not("published_version_id", "is", null),
  ]);
  const currentIds = new Set(unwrap(current, "versiones vigentes").map((m) => m.published_version_id));
  const pubRows = unwrap(pubs as never, "publicaciones") as {
    id: string;
    menu_id: string;
    source: string;
    published_by: string | null;
    published_at: string;
    menus: { name: string } | null;
    menu_versions: { id: string; branch_id: string; version_number: number; change_summary: Record<string, unknown> }[];
  }[];
  const impRows = unwrap(imps as never, "importaciones") as {
    id: string;
    status: string;
    stage: string;
    scope: string;
    created_at: string;
    created_by: string;
    page_count: number;
    summary: Record<string, unknown>;
    provider: string | null;
    menu_id: string;
    menus: { name: string } | null;
    import_branches: { branch_id: string }[];
  }[];
  const names = await profileNames(supabase, [...pubRows.map((p) => p.published_by), ...impRows.map((i) => i.created_by)]);

  let entries: HistoryEntry[] = [
    ...pubRows.map((p) => ({
      type: "publication" as const,
      id: p.id,
      at: p.published_at,
      userName: p.published_by ? (names.get(p.published_by) ?? null) : null,
      menuName: p.menus?.name ?? "Carta",
      menuId: p.menu_id,
      source: p.source,
      branchIds: p.menu_versions.map((v) => v.branch_id),
      status: "published",
      versions: p.menu_versions
        .map((v) => ({ id: v.id, branchId: v.branch_id, versionNumber: v.version_number, summary: v.change_summary, current: currentIds.has(v.id) }))
        .sort((a, b) => a.branchId.localeCompare(b.branchId)),
      importSummary: null,
      provider: null,
      pageCount: null,
    })),
    ...impRows.map((i) => ({
      type: "import" as const,
      id: i.id,
      at: i.created_at,
      userName: names.get(i.created_by) ?? null,
      menuName: i.menus?.name ?? "Carta",
      menuId: i.menu_id,
      source: "photo",
      branchIds: i.import_branches.map((b) => b.branch_id),
      status: i.status,
      versions: [],
      importSummary: i.summary,
      provider: i.provider,
      pageCount: i.page_count,
    })),
  ];
  // Solo lo que corresponde a sucursales visibles para el usuario.
  const visible = new Set(ctx.branches.map((b) => b.id));
  entries = entries
    .map((e) => (e.type === "publication" ? { ...e, versions: e.versions.filter((v) => visible.has(v.branchId)) } : e))
    .filter((e) => (e.type === "publication" ? e.versions.length > 0 : e.branchIds.some((id) => visible.has(id))))
    .filter((e) => !filters.branchId || e.branchIds.includes(filters.branchId));
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const page = entries.slice(0, limit);
  return { entries: page, nextBefore: entries.length > limit || pubRows.length === limit || impRows.length === limit ? page[page.length - 1]?.at ?? null : null };
}

export async function getVersionDetail(ctx: BusinessContext, versionId: string, compareTo: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) notFound();
  const supabase = await createClient();
  const versionResult = await supabase
    .from("menu_versions")
    .select("id, menu_id, branch_id, version_number, snapshot, created_at, change_summary, product_count, publication_id, menus(name)")
    .eq("id", versionId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (versionResult.error) unwrap(versionResult, "versión");
  const version = versionResult.data;
  if (!version) notFound();

  const [siblings, publication, link, menuBranches] = await Promise.all([
    supabase
      .from("menu_versions")
      .select("id, version_number, created_at")
      .eq("menu_id", version.menu_id)
      .eq("branch_id", version.branch_id)
      .order("version_number", { ascending: false }),
    supabase.from("publications").select("source, published_by, published_at, restored_from_version_id").eq("id", version.publication_id).single(),
    supabase.from("menu_branches").select("published_version_id").eq("menu_id", version.menu_id).eq("branch_id", version.branch_id).maybeSingle(),
    supabase.from("menu_branches").select("branch_id").eq("menu_id", version.menu_id),
  ]);
  const list = unwrap(siblings, "versiones");
  const previous = compareTo ? list.find((v) => v.id === compareTo) : list.find((v) => v.version_number < version.version_number);
  let other: { id: string; version_number: number; snapshot: unknown } | null = null;
  if (previous) {
    const { data } = await supabase.from("menu_versions").select("id, version_number, snapshot").eq("id", previous.id).single();
    other = data;
  }
  const pub = unwrap(publication, "publicación");
  const names = await profileNames(supabase, [pub.published_by]);
  return {
    version,
    menuName: (version.menus as unknown as { name: string } | null)?.name ?? "Carta",
    siblings: list,
    other,
    publication: pub,
    publishedByName: pub.published_by ? (names.get(pub.published_by) ?? null) : null,
    isCurrent: link.data?.published_version_id === version.id,
    currentVersionNumber: list.find((v) => v.id === link.data?.published_version_id)?.version_number ?? null,
    menuBranchCount: (menuBranches.data ?? []).length,
  };
}
