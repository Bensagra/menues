import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
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
let northBranch: string;
let northSlug: string;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const plusDays = (key: string, days: number) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function payload(overrides: Record<string, unknown> = {}) {
  const start = today();
  return {
    id: null,
    business_id: business.businessId,
    kind: "daily_menu",
    title: "Menú ejecutivo",
    description: "",
    items: ["Entrada: sopa de calabaza", "Principal: milanesa con puré"],
    price_minor: 1_500_000,
    starts_on: start,
    ends_on: plusDays(start, 6),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_time: "00:00",
    end_time: "23:59",
    branch_ids: [business.branchId],
    ...overrides,
  };
}

const save = (user: TestUser, p: Record<string, unknown>) => user.client.rpc("save_promotion", { p_payload: p } as never);

beforeAll(async () => {
  owner = await createUser("promos");
  business = await createBusiness(owner, "Promociones de Prueba");
  northSlug = `${business.branchSlug}-norte`;
  const { data, error } = await owner.client.rpc("create_branch", {
    p_business_id: business.businessId,
    p_name: "Norte",
    p_public_slug: northSlug,
    p_timezone: "America/Argentina/Buenos_Aires",
    p_address: "",
    p_phone: "",
    p_whatsapp: "",
    p_public_note: "",
    p_opening_hours: [],
  } as never);
  if (error) throw error;
  northBranch = data as unknown as string;
  await owner.client.rpc("set_menu_branches", { p_menu_id: business.menuId, p_branch_ids: [business.branchId, northBranch] } as never);
  const category = await createCategory(owner, business.menuId, "Principales");
  await saveProduct(owner, { menuId: business.menuId, categoryId: category, name: "Milanesa", price: 1_000_000 });
  const published = await publish(owner, business.menuId, [business.branchId, northBranch]);
  if (published.error) throw published.error;
});

describe("menú del día y promociones", () => {
  let dailyId: string;

  it("programa un menú del día y lo muestra en la carta pública de su sucursal", async () => {
    const { data, error } = await save(owner, payload());
    expect(error).toBeNull();
    dailyId = (data as unknown as { id: string }).id;
    const menu = (await publicMenu(business.branchSlug)) as unknown as { promotions: { id: string; title: string; items: string[] }[] };
    expect(menu.promotions).toEqual([expect.objectContaining({ id: dailyId, title: "Menú ejecutivo", items: payload().items })]);
    const north = (await publicMenu(northSlug)) as unknown as { promotions: unknown[] };
    expect(north.promotions).toEqual([]);
  });

  it("no permite dos menús del día superpuestos en la misma sucursal", async () => {
    const overlap = await save(owner, payload({ title: "Menú del mediodía", start_time: "12:00", end_time: "15:00" }));
    expect(overlap.error?.message).toBe("daily_menu_overlap");
    expect(overlap.error?.details).toBe("Menú ejecutivo");
    // Otra sucursal o un horario que no se cruza: se permite.
    const otherBranch = await save(owner, payload({ title: "Menú Norte", branch_ids: [northBranch] }));
    expect(otherBranch.error).toBeNull();
  });

  it("las promociones superpuestas se guardan con advertencia", async () => {
    const first = await save(owner, payload({ kind: "promotion", title: "Happy hour", items: [], start_time: "18:00", end_time: "21:00" }));
    expect(first.error).toBeNull();
    const second = await save(owner, payload({ kind: "promotion", title: "2x1 en pintas", items: [], start_time: "20:00", end_time: "22:00" }));
    expect(second.error).toBeNull();
    expect((second.data as unknown as { overlaps: { title: string }[] }).overlaps).toEqual([expect.objectContaining({ title: "Happy hour" })]);
  });

  it("pausar oculta la promoción y reanudar vuelve a validar superposiciones", async () => {
    const paused = await owner.client.rpc("set_promotion_paused", { p_promotion_id: dailyId, p_paused: true });
    expect(paused.error).toBeNull();
    const menu = (await publicMenu(business.branchSlug)) as unknown as { promotions: { id: string }[] };
    expect(menu.promotions.some((p) => p.id === dailyId)).toBe(false);
    const replacement = await save(owner, payload({ title: "Menú de reemplazo" }));
    expect(replacement.error).toBeNull();
    const resume = await owner.client.rpc("set_promotion_paused", { p_promotion_id: dailyId, p_paused: false });
    expect(resume.error?.message).toBe("daily_menu_overlap");
  });

  it("valida fechas, días y horarios", async () => {
    const start = today();
    const sunday = (() => {
      for (let i = 0; i < 7; i++) {
        const d = plusDays(start, i);
        if (new Date(`${d}T12:00:00Z`).getUTCDay() === 0) return d;
      }
      return start;
    })();
    expect((await save(owner, payload({ kind: "promotion", starts_on: sunday, ends_on: sunday, weekdays: [1] }))).error?.message).toBe("promotion_no_dates");
    expect((await save(owner, payload({ kind: "promotion", start_time: "20:00", end_time: "18:00" }))).error?.message).toBe("promotion_time_order");
    expect((await save(owner, payload({ kind: "promotion", starts_on: "2020-01-01", ends_on: "2020-01-31" }))).error?.message).toBe("promotion_in_past");
  });

  it("solo quien puede publicar programa, y siempre dentro de sus sucursales", async () => {
    const editor = await addMember(owner, business, "editor");
    expect((await save(editor, payload({ kind: "promotion", title: "Sin permiso" }))).error?.message).toBe("forbidden");
    const scoped = await addMember(owner, business, "editor", { canPublish: true, branchIds: [northBranch], allBranches: false });
    const outside = await save(scoped, payload({ kind: "promotion", title: "Fuera de alcance", branch_ids: [business.branchId] }));
    expect(outside.error?.message).toBe("branch_scope");
    const inside = await save(scoped, payload({ kind: "promotion", title: "Promo Norte", branch_ids: [northBranch] }));
    expect(inside.error).toBeNull();
    // No puede pausar ni eliminar una promoción que incluye otra sucursal.
    const pauseOther = await scoped.client.rpc("set_promotion_paused", { p_promotion_id: dailyId, p_paused: true });
    expect(pauseOther.error?.message).toBe("branch_scope");
  });

  it("otro negocio no ve ni toca las promociones", async () => {
    const intruder = await createUser("intruso-promos");
    expect((await save(intruder, payload({ kind: "promotion", title: "Intrusa" }))).error?.message).toBe("not_found");
    const removed = await intruder.client.rpc("delete_promotion", { p_promotion_id: dailyId });
    expect(removed.error?.message).toBe("not_found");
    const { data: rows } = await intruder.client.from("promotions").select("id").eq("business_id", business.businessId);
    expect(rows ?? []).toEqual([]);
    const listed = await intruder.client.rpc("list_promotions", { p_business_id: business.businessId });
    expect(listed.error?.message).toBe("not_found");
  });
});
