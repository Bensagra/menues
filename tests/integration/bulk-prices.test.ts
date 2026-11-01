import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adminClient,
  createBusiness,
  createCategory,
  createUser,
  publicMenu,
  publish,
  saveProduct,
  type TestBusiness,
  type TestUser,
} from "./helpers";

let owner: TestUser;
let business: TestBusiness;
let secondBranch: string;
let milanesa: string;
let bife: string;

const apply = (user: TestUser, menuId: string, branchId: string | null, changes: unknown[], key = randomUUID()) =>
  user.client.rpc("apply_price_changes", {
    p_menu_id: menuId,
    p_branch_id: branchId,
    p_rule: { test: true },
    p_changes: changes,
    p_idempotency_key: key,
  } as never);

async function basePrice(productId: string) {
  const { data } = await adminClient().from("products").select("price_minor, revision").eq("id", productId).single();
  return data as { price_minor: number; revision: number };
}

beforeAll(async () => {
  owner = await createUser("precios");
  business = await createBusiness(owner, "Precios de Prueba");
  const { data: branchId, error } = await owner.client.rpc("create_branch", {
    p_business_id: business.businessId,
    p_name: "Norte",
    p_public_slug: `${business.branchSlug}-norte`,
    p_timezone: "America/Argentina/Buenos_Aires",
    p_address: "",
    p_phone: "",
    p_whatsapp: "",
    p_public_note: "",
    p_opening_hours: [],
  } as never);
  if (error) throw error;
  secondBranch = branchId as unknown as string;
  const linked = await owner.client.rpc("set_menu_branches", { p_menu_id: business.menuId, p_branch_ids: [business.branchId, secondBranch] } as never);
  if (linked.error) throw linked.error;
  const category = await createCategory(owner, business.menuId, "Principales");
  const a = await saveProduct(owner, { menuId: business.menuId, categoryId: category, name: "Milanesa", price: 1_000_000 });
  const b = await saveProduct(owner, { menuId: business.menuId, categoryId: category, name: "Bife", price: 2_000_000 });
  if (a.error || b.error) throw a.error ?? b.error;
  milanesa = (a.data as { id: string }).id;
  bife = (b.data as { id: string }).id;
  const published = await publish(owner, business.menuId, [business.branchId, secondBranch]);
  if (published.error) throw published.error;
});

describe("precios masivos", () => {
  it("aplica al borrador de forma atómica e idempotente, sin tocar la carta publicada", async () => {
    const before = await basePrice(milanesa);
    const key = randomUUID();
    const changes = [
      { target: "product", product_id: milanesa, variant_id: null, stored_from: 1_000_000, base_from: 1_000_000, to: 1_100_000 },
      { target: "product", product_id: bife, variant_id: null, stored_from: 2_000_000, base_from: 2_000_000, to: 2_200_000 },
    ];
    const first = await apply(owner, business.menuId, null, changes, key);
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ changed: 2, replayed: false });
    const replay = await apply(owner, business.menuId, null, changes, key);
    expect(replay.data).toMatchObject({ changed: 2, replayed: true });
    const after = await basePrice(milanesa);
    expect(after.price_minor).toBe(1_100_000);
    expect(after.revision).toBe(before.revision + 1);

    const menu = await publicMenu(business.branchSlug);
    const prices = menu.menus[0].snapshot.categories.flatMap((c) => c.products.map((p) => p.price_minor));
    expect(prices.sort()).toEqual([1_000_000, 2_000_000]);

    const { data: audit } = await adminClient()
      .from("audit_log")
      .select("action, summary")
      .eq("business_id", business.businessId)
      .eq("action", "menu.prices_bulk_updated");
    expect(audit).toHaveLength(1);
  });

  it("si un precio cambió desde la vista previa no aplica nada", async () => {
    const result = await apply(owner, business.menuId, null, [
      { target: "product", product_id: milanesa, variant_id: null, stored_from: 1_100_000, base_from: 1_100_000, to: 1_200_000 },
      { target: "product", product_id: bife, variant_id: null, stored_from: 9_999_900, base_from: 9_999_900, to: 3_000_000 },
    ]);
    expect(result.error?.message).toBe("price_conflict");
    expect((await basePrice(milanesa)).price_minor).toBe(1_100_000);
    expect((await basePrice(bife)).price_minor).toBe(2_200_000);
  });

  it("los precios propios de una sucursal parten del general y se validan", async () => {
    const stale = await apply(owner, business.menuId, secondBranch, [
      { target: "product_branch", product_id: milanesa, variant_id: null, stored_from: null, base_from: 1_000_000, to: 1_050_000 },
    ]);
    expect(stale.error?.message).toBe("price_conflict");
    const ok = await apply(owner, business.menuId, secondBranch, [
      { target: "product_branch", product_id: milanesa, variant_id: null, stored_from: null, base_from: 1_100_000, to: 1_150_000 },
    ]);
    expect(ok.error).toBeNull();
    const { data: override } = await adminClient()
      .from("product_branch_overrides")
      .select("price_minor, status")
      .eq("product_id", milanesa)
      .eq("branch_id", secondBranch)
      .single();
    expect(override).toEqual({ price_minor: 1_150_000, status: null });
    expect((await basePrice(milanesa)).price_minor).toBe(1_100_000);
    const mixed = await apply(owner, business.menuId, secondBranch, [
      { target: "product", product_id: bife, variant_id: null, stored_from: 2_200_000, base_from: 2_200_000, to: 2_300_000 },
    ]);
    expect(mixed.error?.message).toBe("invalid_price_change");
  });

  it("un editor con una sola sucursal no cambia el precio general ni el de otra sucursal", async () => {
    const editor = await addMember(owner, business, "editor", { branchIds: [secondBranch], allBranches: false });
    const base = await apply(editor, business.menuId, null, [
      { target: "product", product_id: bife, variant_id: null, stored_from: 2_200_000, base_from: 2_200_000, to: 2_300_000 },
    ]);
    expect(base.error?.message).toBe("branch_scope");
    const other = await apply(editor, business.menuId, business.branchId, [
      { target: "product_branch", product_id: bife, variant_id: null, stored_from: null, base_from: 2_200_000, to: 2_300_000 },
    ]);
    expect(other.error?.message).toBe("branch_scope");
    const own = await apply(editor, business.menuId, secondBranch, [
      { target: "product_branch", product_id: bife, variant_id: null, stored_from: null, base_from: 2_200_000, to: 2_300_000 },
    ]);
    expect(own.error).toBeNull();
  });

  it("otro negocio no puede aplicar cambios", async () => {
    const intruder = await createUser("intruso-precios");
    const result = await apply(intruder, business.menuId, null, [
      { target: "product", product_id: bife, variant_id: null, stored_from: 2_200_000, base_from: 2_200_000, to: 1 },
    ]);
    expect(result.error?.message).toBe("not_found");
    expect((await basePrice(bife)).price_minor).toBe(2_200_000);
  });
});
