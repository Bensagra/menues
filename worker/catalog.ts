import type { AppSupabaseClient } from "@/lib/supabase/service";
import type { CatalogProduct, DiffInput } from "@/domain/diff";

// Carga del catálogo vigente para comparar. Todas las consultas se filtran por
// el negocio y el menú de la importación (el worker usa service role).

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`No se pudo leer ${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

export interface ImportContext {
  businessId: string;
  menuId: string;
  importId: string;
  createdBy: string;
  scope: DiffInput["scope"];
}

export async function loadCatalogForImport(db: AppSupabaseClient, ctx: ImportContext) {
  const [business, categories, products, variants, importBranches, menuBranches, importCategories, membership] = await Promise.all([
    db.from("businesses").select("currency, locale").eq("id", ctx.businessId).single(),
    db.from("categories").select("id, name").eq("menu_id", ctx.menuId).eq("business_id", ctx.businessId).order("sort_order"),
    db
      .from("products")
      .select("id, category_id, name, description, price_minor, revision")
      .eq("menu_id", ctx.menuId)
      .eq("business_id", ctx.businessId)
      .is("archived_at", null),
    db.from("product_variants").select("id, product_id, name, price_minor").eq("menu_id", ctx.menuId).eq("business_id", ctx.businessId).order("sort_order"),
    db.from("import_branches").select("branch_id").eq("import_id", ctx.importId).eq("business_id", ctx.businessId),
    db.from("menu_branches").select("branch_id").eq("menu_id", ctx.menuId).eq("business_id", ctx.businessId),
    db.from("import_categories").select("category_id").eq("import_id", ctx.importId).eq("business_id", ctx.businessId),
    db
      .from("memberships")
      .select("all_branches, status, membership_branches(branch_id)")
      .eq("business_id", ctx.businessId)
      .eq("user_id", ctx.createdBy)
      .maybeSingle(),
  ]);
  if (business.error || !business.data) throw new Error("No se pudo leer el negocio");

  const importBranchIds = check(importBranches, "las sucursales de la importación").map((b) => b.branch_id);
  const menuBranchIds = check(menuBranches, "las sucursales del menú").map((b) => b.branch_id);
  const baseScope = menuBranchIds.every((id) => importBranchIds.includes(id));

  // Precio vigente en la sucursal de referencia cuando el menú es compartido.
  const referenceBranch = importBranchIds[0];
  const [overrides, variantPrices] = baseScope
    ? [[], []]
    : await Promise.all([
        db
          .from("product_branch_overrides")
          .select("product_id, price_minor")
          .eq("menu_id", ctx.menuId)
          .eq("branch_id", referenceBranch)
          .then((r) => check(r, "precios por sucursal")),
        db
          .from("variant_branch_prices")
          .select("variant_id, price_minor")
          .eq("menu_id", ctx.menuId)
          .eq("branch_id", referenceBranch)
          .then((r) => check(r, "precios de variantes por sucursal")),
      ]);
  const overrideByProduct = new Map((overrides as { product_id: string; price_minor: number | null }[]).map((o) => [o.product_id, o.price_minor]));
  const priceByVariant = new Map((variantPrices as { variant_id: string; price_minor: number }[]).map((v) => [v.variant_id, v.price_minor]));

  const variantsByProduct = new Map<string, CatalogProduct["variants"]>();
  for (const v of check(variants, "las variantes")) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push({ id: v.id, name: v.name, priceMinor: priceByVariant.get(v.id) ?? v.price_minor });
    variantsByProduct.set(v.product_id, list);
  }

  const catalogProducts: CatalogProduct[] = check(products, "los productos").map((p) => ({
    id: p.id,
    categoryId: p.category_id,
    name: p.name,
    description: p.description,
    priceMinor: overrideByProduct.get(p.id) ?? p.price_minor,
    revision: p.revision,
    variants: variantsByProduct.get(p.id) ?? [],
  }));

  const m = membership.data as { all_branches: boolean; status: string; membership_branches: { branch_id: string }[] } | null;
  const coversMenu =
    Boolean(m && m.status === "active") &&
    (m!.all_branches || (menuBranchIds.length > 0 && menuBranchIds.every((id) => m!.membership_branches.some((mb) => mb.branch_id === id))));

  return {
    currency: business.data.currency,
    locale: business.data.locale,
    categories: check(categories, "las categorías"),
    products: catalogProducts,
    scopeCategoryIds: check(importCategories, "las categorías elegidas").map((c) => c.category_id),
    baseScope,
    coversMenu,
  };
}
