import "server-only";
import { notFound } from "next/navigation";
import type { BusinessContext } from "@/server/auth";
import { createClient } from "@/server/supabase/server";
import { coversMenu } from "@/domain/permissions";
import { unwrap } from "./common";

export async function listMenus(ctx: BusinessContext) {
  const supabase = await createClient();
  const data = unwrap(
    await supabase
      .from("menus")
      .select("id, name, description, status, kind, sort_order, archived_at, menu_branches(branch_id, published_version_id), products(count)")
      .eq("business_id", ctx.business.id)
      .is("products.archived_at", null)
      .order("sort_order")
      .order("name"),
    "menús",
  );
  const branchNames = new Map(ctx.branches.map((b) => [b.id, b.name]));
  return (data ?? []).map((menu) => {
    const links = (menu.menu_branches ?? []) as { branch_id: string; published_version_id: string | null }[];
    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      status: menu.status as "active" | "archived",
      kind: menu.kind,
      productCount: (menu.products as unknown as { count: number }[])?.[0]?.count ?? 0,
      branches: links.map((l) => ({ id: l.branch_id, name: branchNames.get(l.branch_id) ?? "Sucursal", published: Boolean(l.published_version_id) })),
      canEdit: coversMenu(ctx.scope, links.map((l) => l.branch_id)),
    };
  });
}

export type MenuListItem = Awaited<ReturnType<typeof listMenus>>[number];

export interface EditorProduct {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_minor: number | null;
  status: "available" | "sold_out" | "hidden";
  tags: string[];
  image_media_id: string | null;
  image: { sm: string; lg: string } | null;
  sort_order: number;
  revision: number;
  archived_at: string | null;
  updated_at: string;
  variants: { id: string; name: string; price_minor: number | null; sort_order: number }[];
  extras: { id: string; name: string; price_minor: number; sort_order: number }[];
  overrides: { branch_id: string; price_minor: number | null; status: string | null }[];
  variantPrices: { variant_id: string; branch_id: string; price_minor: number }[];
}

export async function getMenuEditorData(ctx: BusinessContext, menuId: string) {
  const supabase = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(menuId)) notFound();
  const menuResult = await supabase
    .from("menus")
    .select("id, name, description, status, kind, business_id, menu_branches(branch_id, published_version_id, published_at)")
    .eq("id", menuId)
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (menuResult.error) unwrap(menuResult, "carta");
  const menu = menuResult.data;
  if (!menu) notFound();

  const [categoriesResult, productsResult, variantsResult, extrasResult, overridesResult, variantPricesResult, statusResult] =
    await Promise.all([
      supabase.from("categories").select("id, name, description, sort_order, revision").eq("menu_id", menuId).order("sort_order").order("name"),
      supabase
        .from("products")
        .select("id, category_id, name, description, price_minor, status, tags, image_media_id, sort_order, revision, archived_at, updated_at, media:media!products_business_id_image_media_id_fkey(path_sm, path_lg)")
        .eq("menu_id", menuId)
        .order("sort_order")
        .order("name"),
      supabase.from("product_variants").select("id, product_id, name, price_minor, sort_order").eq("menu_id", menuId).order("sort_order"),
      supabase.from("product_extras").select("id, product_id, name, price_minor, sort_order").eq("menu_id", menuId).order("sort_order"),
      supabase.from("product_branch_overrides").select("product_id, branch_id, price_minor, status").eq("menu_id", menuId),
      supabase.from("variant_branch_prices").select("variant_id, branch_id, price_minor").eq("menu_id", menuId),
      supabase.rpc("get_menu_publish_status", { p_menu_id: menuId }),
    ]);
  const categories = unwrap(categoriesResult, "categorías");
  const products = unwrap(productsResult, "productos");
  const variants = unwrap(variantsResult, "variantes");
  const extras = unwrap(extrasResult, "extras");
  const overrides = unwrap(overridesResult, "precios por sucursal");
  const variantPrices = unwrap(variantPricesResult, "precios de variantes por sucursal");
  const status = unwrap(statusResult, "estado de publicación");

  const variantsByProduct = new Map<string, EditorProduct["variants"]>();
  for (const v of variants ?? []) variantsByProduct.set(v.product_id, [...(variantsByProduct.get(v.product_id) ?? []), v]);
  const extrasByProduct = new Map<string, EditorProduct["extras"]>();
  for (const e of extras ?? []) extrasByProduct.set(e.product_id, [...(extrasByProduct.get(e.product_id) ?? []), e]);
  const overridesByProduct = new Map<string, EditorProduct["overrides"]>();
  for (const o of overrides ?? []) overridesByProduct.set(o.product_id, [...(overridesByProduct.get(o.product_id) ?? []), o]);
  const variantToProduct = new Map((variants ?? []).map((v) => [v.id, v.product_id]));
  const variantPricesByProduct = new Map<string, EditorProduct["variantPrices"]>();
  for (const vp of variantPrices ?? []) {
    const productId = variantToProduct.get(vp.variant_id);
    if (productId) variantPricesByProduct.set(productId, [...(variantPricesByProduct.get(productId) ?? []), vp]);
  }

  const editorProducts: EditorProduct[] = (products ?? []).map((p) => {
    const media = p.media as unknown as { path_sm: string; path_lg: string } | null;
    return {
      id: p.id,
      category_id: p.category_id,
      name: p.name,
      description: p.description,
      price_minor: p.price_minor,
      status: p.status as EditorProduct["status"],
      tags: p.tags,
      image_media_id: p.image_media_id,
      image: media ? { sm: media.path_sm, lg: media.path_lg } : null,
      sort_order: p.sort_order,
      revision: p.revision,
      archived_at: p.archived_at,
      updated_at: p.updated_at,
      variants: variantsByProduct.get(p.id) ?? [],
      extras: extrasByProduct.get(p.id) ?? [],
      overrides: overridesByProduct.get(p.id) ?? [],
      variantPrices: variantPricesByProduct.get(p.id) ?? [],
    };
  });

  const links = (menu.menu_branches ?? []) as { branch_id: string; published_version_id: string | null; published_at: string | null }[];
  const branchNames = new Map(ctx.branches.map((b) => [b.id, b]));
  const menuBranches = links
    .map((l) => ({ id: l.branch_id, name: branchNames.get(l.branch_id)?.name ?? "Sucursal (sin acceso)", accessible: branchNames.has(l.branch_id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  return {
    menu: { id: menu.id, name: menu.name, description: menu.description, status: menu.status as "active" | "archived", kind: menu.kind },
    categories: categories ?? [],
    products: editorProducts,
    menuBranches,
    publishStatus: status ?? [],
    canEditContent: coversMenu(ctx.scope, links.map((l) => l.branch_id)),
  };
}

export type MenuEditorData = Awaited<ReturnType<typeof getMenuEditorData>>;
