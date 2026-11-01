"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MAX_MINOR, formatMoney } from "@/domain/money";
import { PRODUCT_TAG_KEYS, diffSnapshots, parseSnapshot, type MenuSnapshot } from "@/domain/snapshot";
import { nameKey } from "@/domain/text";
import { authedAction, fail, parseInput, rpc } from "@/server/action";
import { invalidatePublicMenus } from "@/server/cache";
import { createStagingUpload, processStagedImage, type MediaKind } from "@/server/media";

const uuid = z.string().uuid();
const price = z.number().int().min(0).max(MAX_MINOR);

// ---------------------------------------------------------------------------
// Menús
// ---------------------------------------------------------------------------
const menuSchema = z.object({
  name: z.string().trim().min(1, "Escribí un nombre.").max(80, "Máximo 80 caracteres."),
  description: z.string().trim().max(300, "Máximo 300 caracteres.").default(""),
});

export async function createMenuAction(businessId: string, input: { name: string; description?: string; branchIds: string[]; kind?: "regular" | "daily" }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(menuSchema.extend({ branchIds: z.array(uuid).max(50), kind: z.enum(["regular", "daily"]).default("regular") }), input);
    const id = await rpc<string>(supabase, "create_menu", {
      p_business_id: parseInput(uuid, businessId),
      p_name: data.name,
      p_description: data.description,
      p_branch_ids: data.branchIds,
      p_kind: data.kind,
    });
    refresh();
    return { menuId: id };
  });
}

export async function updateMenuAction(menuId: string, input: { name: string; description?: string }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(menuSchema, input);
    await rpc(supabase, "update_menu", { p_menu_id: parseInput(uuid, menuId), p_name: data.name, p_description: data.description });
    refresh();
    return null;
  });
}

export async function archiveMenuAction(menuId: string, archived: boolean) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ branch_slugs: string[] }>(supabase, archived ? "archive_menu" : "unarchive_menu", {
      p_menu_id: parseInput(uuid, menuId),
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return null;
  });
}

export async function duplicateMenuAction(menuId: string, name: string) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(menuSchema.pick({ name: true }), { name });
    const id = await rpc<string>(supabase, "duplicate_menu", { p_menu_id: parseInput(uuid, menuId), p_name: data.name });
    refresh();
    return { menuId: id };
  });
}

export async function setMenuBranchesAction(menuId: string, branchIds: string[]) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ branch_slugs: string[] }>(supabase, "set_menu_branches", {
      p_menu_id: parseInput(uuid, menuId),
      p_branch_ids: parseInput(z.array(uuid).max(50), branchIds),
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().trim().min(1, "Escribí un nombre.").max(80, "Máximo 80 caracteres."),
  description: z.string().trim().max(300, "Máximo 300 caracteres.").default(""),
});

export async function createCategoryAction(menuId: string, input: { name: string; description?: string }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(categorySchema, input);
    const id = await rpc<string>(supabase, "create_category", { p_menu_id: parseInput(uuid, menuId), p_name: data.name, p_description: data.description });
    refresh();
    return { categoryId: id };
  });
}

export async function updateCategoryAction(categoryId: string, input: { name: string; description?: string; expectedRevision: number }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(categorySchema.extend({ expectedRevision: z.number().int() }), input);
    await rpc(supabase, "update_category", {
      p_category_id: parseInput(uuid, categoryId),
      p_name: data.name,
      p_description: data.description,
      p_expected_revision: data.expectedRevision,
    });
    refresh();
    return null;
  });
}

export async function reorderCategoriesAction(menuId: string, categoryIds: string[]) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "reorder_categories", { p_menu_id: parseInput(uuid, menuId), p_category_ids: parseInput(z.array(uuid).max(100), categoryIds) });
    refresh();
    return null;
  });
}

export async function deleteCategoryAction(categoryId: string, moveToCategoryId: string | null) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "delete_category", {
      p_category_id: parseInput(uuid, categoryId),
      p_move_to_category_id: moveToCategoryId ? parseInput(uuid, moveToCategoryId) : null,
    });
    refresh();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------
const productSchema = z
  .object({
    id: uuid.nullable(),
    menuId: uuid,
    categoryId: z.string({ message: "Elegí una categoría." }).uuid("Elegí una categoría."),
    expectedRevision: z.number().int().nullable(),
    name: z.string().trim().min(1, "Escribí el nombre del producto.").max(120, "Máximo 120 caracteres."),
    description: z.string().trim().max(600, "Máximo 600 caracteres."),
    priceMinor: price.nullable(),
    status: z.enum(["available", "sold_out", "hidden"]),
    tags: z.array(z.enum(PRODUCT_TAG_KEYS as [string, ...string[]])).max(8),
    imageMediaId: uuid.nullable(),
    variants: z
      .array(z.object({ id: uuid.nullable(), name: z.string().trim().min(1, "Escribí el nombre de la variante.").max(60), priceMinor: price.nullable() }))
      .max(20, "Máximo 20 variantes."),
    extras: z
      .array(z.object({ id: uuid.nullable(), name: z.string().trim().min(1, "Escribí el nombre del extra.").max(60), priceMinor: price }))
      .max(30, "Máximo 30 extras."),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.variants.forEach((v, i) => {
      const key = nameKey(v.name);
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i, "name"], message: "Hay otra variante con este nombre." });
      seen.add(key);
    });
    const seenExtras = new Set<string>();
    value.extras.forEach((e, i) => {
      const key = nameKey(e.name);
      if (seenExtras.has(key)) ctx.addIssue({ code: "custom", path: ["extras", i, "name"], message: "Hay otro extra con este nombre." });
      seenExtras.add(key);
    });
  });

export type ProductInput = z.input<typeof productSchema>;

export async function saveProductAction(input: ProductInput) {
  return authedAction(async ({ supabase }) => {
    const p = parseInput(productSchema, input);
    const result = await rpc<{ id: string; revision: number }>(supabase, "save_product", {
      p_payload: {
        id: p.id,
        menu_id: p.menuId,
        category_id: p.categoryId,
        ...(p.expectedRevision !== null ? { expected_revision: p.expectedRevision } : {}),
        name: p.name,
        description: p.description,
        price_minor: p.priceMinor,
        status: p.status,
        tags: p.tags,
        image_media_id: p.imageMediaId,
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, price_minor: v.priceMinor })),
        extras: p.extras.map((e) => ({ id: e.id, name: e.name, price_minor: e.priceMinor })),
      },
    });
    refresh();
    return result;
  });
}

export async function setProductStatusAction(productId: string, status: "available" | "sold_out" | "hidden") {
  return authedAction(async ({ supabase }) => {
    const revision = await rpc<number>(supabase, "set_product_status", {
      p_product_id: parseInput(uuid, productId),
      p_status: parseInput(z.enum(["available", "sold_out", "hidden"]), status),
    });
    refresh();
    return { revision };
  });
}

export async function duplicateProductAction(productId: string) {
  return authedAction(async ({ supabase }) => {
    const id = await rpc<string>(supabase, "duplicate_product", { p_product_id: parseInput(uuid, productId) });
    refresh();
    return { productId: id };
  });
}

export async function archiveProductAction(productId: string, archived: boolean) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, archived ? "archive_product" : "unarchive_product", { p_product_id: parseInput(uuid, productId) });
    refresh();
    return null;
  });
}

export async function reorderProductsAction(categoryId: string, productIds: string[]) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "reorder_products", {
      p_category_id: parseInput(uuid, categoryId),
      p_product_ids: parseInput(z.array(uuid).max(1000), productIds),
    });
    refresh();
    return null;
  });
}

export async function setBranchOverrideAction(input: {
  productId: string;
  branchId: string;
  priceMinor: number | null;
  status: "available" | "sold_out" | "hidden" | null;
  variantPrices: { variantId: string; priceMinor: number | null }[];
}) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(
      z.object({
        productId: uuid,
        branchId: uuid,
        priceMinor: price.nullable(),
        status: z.enum(["available", "sold_out", "hidden"]).nullable(),
        variantPrices: z.array(z.object({ variantId: uuid, priceMinor: price.nullable() })).max(20),
      }),
      input,
    );
    await rpc(supabase, "set_branch_override", {
      p_product_id: data.productId,
      p_branch_id: data.branchId,
      p_price_minor: data.priceMinor,
      p_status: data.status,
      p_variant_prices: data.variantPrices.map((v) => ({ variant_id: v.variantId, price_minor: v.priceMinor })),
    });
    refresh();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------------
export async function requestImageUploadAction(businessId: string, kind: MediaKind, contentType: string, size: number) {
  return authedAction(async ({ supabase, user }) => {
    const id = parseInput(uuid, businessId);
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("business_id", id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) fail("not_found");
    if (kind !== "product_image" && membership.role === "editor") fail("forbidden");
    return createStagingUpload(id, contentType, size);
  });
}

export async function processImageAction(businessId: string, kind: MediaKind, stagingPath: string) {
  return authedAction(async ({ user }) => {
    const id = parseInput(uuid, businessId);
    const media = await processStagedImage({ actorId: user.id, businessId: id, stagingPath: parseInput(z.string().max(300), stagingPath), kind });
    return media;
  });
}

// ---------------------------------------------------------------------------
// Publicación
// ---------------------------------------------------------------------------
export interface PublishPreviewBranch {
  branchId: string;
  name: string;
  hasChanges: boolean;
  firstPublication: boolean;
  productCount: number;
  added: number;
  removed: number;
  changed: number;
  priceChanges: number;
  entries: ReturnType<typeof diffSnapshots>;
}

export async function publishPreviewAction(menuId: string) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, menuId);
    const { data: status, error } = await supabase.rpc("get_menu_publish_status", { p_menu_id: id });
    if (error) fail(error.message);
    const { data: menu } = await supabase.from("menus").select("business_id, businesses(currency, locale)").eq("id", id).single();
    const business = menu?.businesses as unknown as { currency: string; locale: string } | null;
    const currency = business?.currency ?? "ARS";
    const locale = business?.locale ?? "es-AR";
    const format = (minor: number | null) => (minor === null ? "" : formatMoney(minor, currency, locale));

    const branches: PublishPreviewBranch[] = [];
    for (const row of status ?? []) {
      const draft = parseSnapshot(await rpc(supabase, "get_draft_snapshot", { p_menu_id: id, p_branch_id: row.branch_id }));
      let current: MenuSnapshot | null = null;
      if (row.published_version_id) {
        const { data: version } = await supabase.from("menu_versions").select("snapshot").eq("id", row.published_version_id).single();
        current = version ? parseSnapshot(version.snapshot) : null;
      }
      const entries = diffSnapshots(current, draft, format);
      branches.push({
        branchId: row.branch_id,
        name: row.branch_name,
        hasChanges: row.has_changes,
        firstPublication: !current,
        productCount: row.draft_product_count,
        added: entries.filter((e) => e.type === "added").length,
        removed: entries.filter((e) => e.type === "removed").length,
        changed: entries.filter((e) => e.type === "changed").length,
        priceChanges: entries.filter((e) => e.changes.some((c) => c.field === "price" || c.field === "variants")).length,
        entries: entries.slice(0, 60),
      });
    }
    return { branches };
  });
}

export async function publishMenuAction(menuId: string, branchIds: string[], idempotencyKey: string, options: { source?: "manual" | "import" | "bulk_price"; importId?: string | null } = {}) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{
      publication_id: string | null;
      changed: boolean;
      replayed: boolean;
      branch_slugs: string[];
      branches: { branch_id: string; changed: boolean; version_number: number }[];
    }>(supabase, "publish_menu", {
      p_menu_id: parseInput(uuid, menuId),
      p_branch_ids: parseInput(z.array(uuid).min(1, "Elegí al menos una sucursal.").max(50), branchIds),
      p_idempotency_key: parseInput(uuid, idempotencyKey),
      p_note: "",
      p_source: options.source ?? "manual",
      p_import_id: options.importId ?? null,
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return result;
  });
}

export async function restoreVersionAction(versionId: string, restoreDraft: boolean, idempotencyKey: string) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ publication_id: string | null; changed: boolean; branch_slugs: string[]; branches: { version_number: number }[] }>(
      supabase,
      "restore_menu_version",
      { p_version_id: parseInput(uuid, versionId), p_idempotency_key: parseInput(uuid, idempotencyKey), p_restore_draft: Boolean(restoreDraft) },
    );
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return result;
  });
}
