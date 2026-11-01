"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import {
  MAX_PERCENT_BASIS_POINTS,
  MIN_PERCENT_BASIS_POINTS,
  changesFingerprint,
  computeBulkPriceChanges,
  type BulkPriceRule,
  type PriceChange,
  type PricedItem,
} from "@/domain/bulk-prices";
import { MAX_MINOR } from "@/domain/money";
import { authedAction, fail, parseInput, rpc, type ActionContext } from "@/server/action";
import { unwrap } from "@/server/queries/common";

const uuid = z.string().uuid();

const ruleSchema = z.object({
  change: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("percent"),
      basisPoints: z
        .number()
        .int()
        .min(MIN_PERCENT_BASIS_POINTS, "El descuento máximo es 90 %.")
        .max(MAX_PERCENT_BASIS_POINTS, "El aumento máximo es 500 %.")
        .refine((v) => v !== 0, "Escribí un porcentaje distinto de cero."),
    }),
    z.object({
      type: z.literal("amount"),
      minor: z
        .number()
        .int()
        .min(-MAX_MINOR)
        .max(MAX_MINOR)
        .refine((v) => v !== 0, "Escribí un importe distinto de cero."),
    }),
  ]),
  rounding: z.object({ step: z.number().int().min(1).max(10_000_000), mode: z.enum(["none", "nearest", "up", "down"]) }),
  target: z.discriminatedUnion("type", [z.object({ type: z.literal("base") }), z.object({ type: z.literal("branch"), branchId: uuid })]),
  categoryIds: z.array(uuid).min(1, "Elegí al menos una categoría.").max(300).nullable(),
});

export interface BulkPricePreview {
  total: number;
  changes: PriceChange[];
  truncated: boolean;
  fingerprint: string;
  categories: number;
  /** Sucursales cuyo precio visible cambia */
  affectedBranches: string[];
  /** Por sucursal, cuántos precios no cambian porque tiene precio propio */
  keepsOwn: { branch: string; count: number }[];
}

const PREVIEW_LIMIT = 400;

async function loadPricedItems(supabase: ActionContext["supabase"], menuId: string) {
  const [menu, categories, products, variants, overrides, variantPrices, links] = await Promise.all([
    supabase.from("menus").select("id, status").eq("id", menuId).maybeSingle(),
    supabase.from("categories").select("id, name, sort_order").eq("menu_id", menuId),
    supabase.from("products").select("id, name, category_id, price_minor").eq("menu_id", menuId).is("archived_at", null).order("sort_order"),
    supabase.from("product_variants").select("id, product_id, name, price_minor").eq("menu_id", menuId).order("sort_order"),
    supabase.from("product_branch_overrides").select("product_id, branch_id, price_minor").eq("menu_id", menuId).not("price_minor", "is", null),
    supabase.from("variant_branch_prices").select("variant_id, branch_id, price_minor").eq("menu_id", menuId),
    supabase.from("menu_branches").select("branch_id, branches(name)").eq("menu_id", menuId),
  ]);
  if (menu.error) unwrap(menu, "carta");
  if (!menu.data) fail("not_found");
  if (menu.data.status !== "active") fail("menu_archived");
  const categoryRows = unwrap(categories, "categorías");
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
  const categoryOrder = new Map(categoryRows.map((c) => [c.id, c.sort_order]));
  const productOverrides = new Map<string, { branchId: string; price: number }[]>();
  for (const o of unwrap(overrides, "precios por sucursal")) {
    if (o.price_minor === null) continue;
    productOverrides.set(o.product_id, [...(productOverrides.get(o.product_id) ?? []), { branchId: o.branch_id, price: o.price_minor }]);
  }
  const variantOverrides = new Map<string, { branchId: string; price: number }[]>();
  for (const v of unwrap(variantPrices, "precios de variantes por sucursal")) {
    variantOverrides.set(v.variant_id, [...(variantOverrides.get(v.variant_id) ?? []), { branchId: v.branch_id, price: v.price_minor }]);
  }
  const variantsByProduct = new Map<string, { id: string; name: string; price_minor: number | null }[]>();
  for (const v of unwrap(variants, "variantes")) variantsByProduct.set(v.product_id, [...(variantsByProduct.get(v.product_id) ?? []), v]);

  const items: PricedItem[] = [];
  // Mismo orden que la carta: categoría y después producto.
  const productRows = [...unwrap(products, "productos")].sort(
    (a, b) => (categoryOrder.get(a.category_id) ?? 0) - (categoryOrder.get(b.category_id) ?? 0),
  );
  for (const p of productRows) {
    const base = { productId: p.id, productName: p.name, categoryId: p.category_id, categoryName: categoryName.get(p.category_id) ?? "" };
    items.push({ ...base, variantId: null, variantName: null, basePrice: p.price_minor, branchPrices: productOverrides.get(p.id) ?? [] });
    for (const v of variantsByProduct.get(p.id) ?? []) {
      items.push({ ...base, variantId: v.id, variantName: v.name, basePrice: v.price_minor, branchPrices: variantOverrides.get(v.id) ?? [] });
    }
  }
  const branchNames = new Map(
    unwrap(links, "sucursales de la carta").map((l) => [l.branch_id, (l.branches as unknown as { name: string } | null)?.name ?? "Sucursal"]),
  );
  return { items, branchNames };
}

function fingerprintOf(changes: PriceChange[]) {
  return createHash("sha256").update(changesFingerprint(changes)).digest("hex");
}

function summarize(changes: PriceChange[], rule: BulkPriceRule, branchNames: Map<string, string>): Omit<BulkPricePreview, "changes" | "truncated" | "fingerprint" | "total"> {
  const categories = new Set(changes.map((c) => c.categoryName)).size;
  if (rule.target.type === "branch") {
    return { categories, affectedBranches: changes.length ? [branchNames.get(rule.target.branchId) ?? "Sucursal"] : [], keepsOwn: [] };
  }
  const keep = new Map<string, number>();
  for (const c of changes) for (const b of c.keepsOwnPrice) keep.set(b, (keep.get(b) ?? 0) + 1);
  // Una sucursal se ve afectada si al menos un precio cambiado no tiene precio propio en ella.
  const affected = [...branchNames.entries()].filter(([id]) => changes.some((c) => !c.keepsOwnPrice.includes(id))).map(([, name]) => name);
  return {
    categories,
    affectedBranches: affected.sort((a, b) => a.localeCompare(b, "es")),
    keepsOwn: [...keep.entries()].map(([id, count]) => ({ branch: branchNames.get(id) ?? "Sucursal", count })),
  };
}

export async function previewBulkPricesAction(menuId: string, input: z.input<typeof ruleSchema>) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, menuId);
    const rule = parseInput(ruleSchema, input) as BulkPriceRule;
    const { items, branchNames } = await loadPricedItems(supabase, id);
    if (rule.target.type === "branch" && !branchNames.has(rule.target.branchId)) fail("branch_not_in_menu");
    const changes = computeBulkPriceChanges(items, rule);
    const preview: BulkPricePreview = {
      total: changes.length,
      changes: changes.slice(0, PREVIEW_LIMIT),
      truncated: changes.length > PREVIEW_LIMIT,
      fingerprint: fingerprintOf(changes),
      ...summarize(changes, rule, branchNames),
    };
    return preview;
  });
}

/**
 * Aplica al borrador. Se recalcula todo con los datos actuales: si difiere de la
 * vista previa que vio la persona, no se aplica nada.
 */
export async function applyBulkPricesAction(menuId: string, input: z.input<typeof ruleSchema>, fingerprint: string, idempotencyKey: string) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, menuId);
    const key = parseInput(uuid, idempotencyKey);
    const rule = parseInput(ruleSchema, input) as BulkPriceRule;
    const previous = await supabase.from("price_bulk_operations").select("id, change_count").eq("idempotency_key", key).maybeSingle();
    if (previous.data) return { changed: previous.data.change_count, replayed: true };

    const { items } = await loadPricedItems(supabase, id);
    const changes = computeBulkPriceChanges(items, rule);
    if (changes.length === 0) fail("no_price_changes");
    if (fingerprintOf(changes) !== fingerprint) fail("bulk_preview_stale");
    const result = await rpc<{ changed: number; replayed: boolean }>(supabase, "apply_price_changes", {
      p_menu_id: id,
      p_branch_id: rule.target.type === "branch" ? rule.target.branchId : null,
      p_rule: rule,
      p_changes: changes.map((c) => ({
        target: c.target,
        product_id: c.productId,
        variant_id: c.variantId,
        stored_from: c.storedFrom,
        base_from: c.baseFrom,
        to: c.to,
      })),
      p_idempotency_key: key,
    });
    refresh();
    return { changed: result.changed, replayed: result.replayed };
  });
}
