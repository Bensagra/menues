import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  adminClient,
  createBusiness,
  createCategory,
  createUser,
  publish,
  saveProduct,
  type TestBusiness,
  type TestUser,
} from "./helpers";

interface Stats {
  totals: { menu_views: number; product_views: number; searches: number };
  daily: { day: string; menu_views: number }[];
  hourly: { hour: number; menu_views: number }[];
  top_products: { product_id: string; name: string; views: number }[];
}

let owner: TestUser;
let other: TestUser;
let business: TestBusiness;
let otherBusiness: TestBusiness;
let productId: string;
let otherProductId: string;

const track = (slug: string, event: string, productId: string | null = null, viewerId: string | null = null) =>
  adminClient().rpc("server_track_event", { p_slug: slug, p_event: event, p_product_id: productId, p_viewer_id: viewerId } as never);

beforeAll(async () => {
  owner = await createUser("estadisticas");
  other = await createUser("ajeno");
  business = await createBusiness(owner, "Estadísticas de Prueba");
  otherBusiness = await createBusiness(other, "Otro Negocio");
  const category = await createCategory(owner, business.menuId, "Principales");
  const saved = await saveProduct(owner, { menuId: business.menuId, categoryId: category, name: "Milanesa", price: 1_000_000 });
  if (saved.error) throw saved.error;
  productId = (saved.data as { id: string }).id;
  const otherCategory = await createCategory(other, otherBusiness.menuId, "Postres");
  const otherSaved = await saveProduct(other, { menuId: otherBusiness.menuId, categoryId: otherCategory, name: "Flan", price: 500_000 });
  if (otherSaved.error) throw otherSaved.error;
  otherProductId = (otherSaved.data as { id: string }).id;
});

describe("estadísticas de la carta pública", () => {
  it("no cuenta visitas de cartas sin publicar", async () => {
    const { data } = await track(business.branchSlug, "menu_view");
    expect(data).toBe("unpublished");
  });

  it("cuenta visitas, consultas y búsquedas agregadas sin datos personales", async () => {
    const published = await publish(owner, business.menuId, [business.branchId]);
    expect(published.error).toBeNull();
    for (const event of ["menu_view", "menu_view", "search"]) {
      const { data, error } = await track(business.branchSlug, event);
      expect(error).toBeNull();
      expect(data).toBe("ok");
    }
    expect((await track(business.branchSlug, "product_view", productId)).data).toBe("ok");

    const { data: stats, error } = await owner.client.rpc("get_branch_stats", { p_branch_id: business.branchId, p_days: 7 });
    expect(error).toBeNull();
    const s = stats as unknown as Stats;
    expect(s.totals).toEqual({ menu_views: 2, product_views: 1, searches: 1 });
    expect(s.daily).toHaveLength(7);
    expect(s.hourly).toHaveLength(24);
    expect(s.top_products).toEqual([expect.objectContaining({ product_id: productId, name: "Milanesa", views: 1 })]);

    const { data: rows } = await adminClient().from("stats_branch_hourly").select("*").eq("branch_id", business.branchId);
    expect(Object.keys(rows?.[0] ?? {}).sort()).toEqual(["branch_id", "business_id", "day", "hour", "menu_views", "product_views", "searches"]);
  });

  it("no cuenta al equipo del negocio ni a la plataforma", async () => {
    const editor = await addMember(owner, business, "editor");
    expect((await track(business.branchSlug, "menu_view", null, owner.id)).data).toBe("skipped");
    expect((await track(business.branchSlug, "menu_view", null, editor.id)).data).toBe("skipped");
    // Alguien con sesión pero sin relación con el negocio sí cuenta.
    expect((await track(business.branchSlug, "menu_view", null, other.id)).data).toBe("ok");
  });

  it("rechaza productos de otro negocio, eventos inventados y cuentas suspendidas", async () => {
    expect((await track(business.branchSlug, "product_view", otherProductId)).data).toBe("invalid_product");
    expect((await track(business.branchSlug, "product_view", null)).data).toBe("invalid_product");
    expect((await track(business.branchSlug, "purchase")).data).toBe("invalid_event");
    expect((await track("no-existe-esta-carta", "menu_view")).data).toBe("not_found");
    const admin = adminClient();
    await admin.from("businesses").update({ status: "suspended", suspended_at: new Date().toISOString() } as never).eq("id", business.businessId);
    try {
      expect((await track(business.branchSlug, "menu_view")).data).toBe("not_found");
    } finally {
      await admin.from("businesses").update({ status: "active", suspended_at: null } as never).eq("id", business.businessId);
    }
  });

  it("otro negocio no puede leer las estadísticas y nadie autenticado puede registrar eventos directo", async () => {
    const { error } = await other.client.rpc("get_branch_stats", { p_branch_id: business.branchId, p_days: 30 });
    expect(error?.message).toBe("not_found");
    const { data: rows } = await other.client.from("stats_branch_hourly").select("*").eq("branch_id", business.branchId);
    expect(rows ?? []).toEqual([]);
    const { data: products } = await other.client.from("stats_product_daily").select("*").eq("branch_id", business.branchId);
    expect(products ?? []).toEqual([]);
    const direct = await owner.client.rpc("server_track_event", { p_slug: business.branchSlug, p_event: "menu_view", p_product_id: null, p_viewer_id: null } as never);
    expect(direct.error).not.toBeNull();
  });

  it("un editor sin acceso a la sucursal no ve sus estadísticas", async () => {
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
    expect(error).toBeNull();
    const scoped = await addMember(owner, business, "editor", { branchIds: [branchId as unknown as string], allBranches: false });
    const denied = await scoped.client.rpc("get_branch_stats", { p_branch_id: business.branchId, p_days: 30 });
    expect(denied.error?.message).toBe("not_found");
    const allowed = await scoped.client.rpc("get_branch_stats", { p_branch_id: branchId as unknown as string, p_days: 30 });
    expect(allowed.error).toBeNull();
  });
});
