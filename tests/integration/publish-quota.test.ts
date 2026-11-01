import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, createBusiness, createCategory, createUser, publicMenu, publish, saveProduct, type TestBusiness, type TestUser } from "./helpers";
import { drainQueue, submitImport } from "./import-helpers";

let owner: TestUser;
let business: TestBusiness;
let category: string;
let productId: string;

async function versions() {
  const { data } = await adminClient()
    .from("menu_versions")
    .select("id, version_number, content_hash, publication_id")
    .eq("menu_id", business.menuId)
    .eq("branch_id", business.branchId)
    .order("version_number");
  return data ?? [];
}

async function setPrice(price: number) {
  const { data: current } = await adminClient().from("products").select("revision").eq("id", productId).single();
  const result = await saveProduct(owner, { id: productId, menuId: business.menuId, categoryId: category, name: "Milanesa", price, expectedRevision: current!.revision });
  if (result.error) throw result.error;
}

beforeAll(async () => {
  owner = await createUser("publica");
  business = await createBusiness(owner, "Publicaciones de Prueba");
  category = await createCategory(owner, business.menuId, "Principales");
  const created = await saveProduct(owner, { menuId: business.menuId, categoryId: category, name: "Milanesa", price: 1000000 });
  productId = (created.data as { id: string }).id;
});

describe("publicación", () => {
  it("es idempotente: repetir con la misma clave no duplica versiones", async () => {
    const key = randomUUID();
    const first = await publish(owner, business.menuId, [business.branchId], key);
    expect(first.error).toBeNull();
    const second = await publish(owner, business.menuId, [business.branchId], key);
    expect(second.error).toBeNull();
    expect((second.data as { replayed: boolean }).replayed).toBe(true);
    expect((second.data as { publication_id: string }).publication_id).toBe((first.data as { publication_id: string }).publication_id);
    expect(await versions()).toHaveLength(1);

    // Publicar sin cambios no crea una versión nueva.
    const noChanges = await publish(owner, business.menuId, [business.branchId]);
    expect((noChanges.data as { changed: boolean }).changed).toBe(false);
    expect(await versions()).toHaveLength(1);
  });

  it("es atómica: publicaciones concurrentes generan una sola versión coherente", async () => {
    await setPrice(1100000);
    const results = await Promise.all(Array.from({ length: 5 }, () => publish(owner, business.menuId, [business.branchId])));
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.filter((r) => (r.data as { changed: boolean }).changed)).toHaveLength(1);
    const list = await versions();
    expect(list.map((v) => v.version_number)).toEqual([1, 2]);
    const menu = await publicMenu(business.branchSlug);
    expect(menu.menus[0].version_number).toBe(2);
    expect(menu.menus[0].snapshot.categories[0].products[0].price_minor).toBe(1100000);
  });

  it("restaurar crea una publicación nueva y conserva el historial", async () => {
    const [v1] = await versions();
    const restored = await owner.client.rpc("restore_menu_version", { p_version_id: v1.id, p_idempotency_key: randomUUID(), p_restore_draft: true });
    expect(restored.error).toBeNull();
    const list = await versions();
    expect(list.map((v) => v.version_number)).toEqual([1, 2, 3]);
    expect(list[2].content_hash).toBe(list[0].content_hash);
    const { data: publication } = await adminClient().from("publications").select("source, restored_from_version_id").eq("id", list[2].publication_id).single();
    expect(publication).toEqual({ source: "restore", restored_from_version_id: v1.id });
    expect((await publicMenu(business.branchSlug)).menus[0].snapshot.categories[0].products[0].price_minor).toBe(1000000);
    // Con "restaurar también el borrador", el borrador vuelve a la versión elegida.
    const { data: draft } = await adminClient().from("products").select("price_minor").eq("id", productId).single();
    expect(draft?.price_minor).toBe(1000000);
  });

  it("las versiones publicadas son inmutables", async () => {
    const [v1] = await versions();
    const { error } = await adminClient().from("menu_versions").update({ product_count: 99 } as never).eq("id", v1.id);
    expect(error?.message).toBe("version_immutable");
  });

  it("archivar un producto no rompe versiones históricas", async () => {
    const { data: current } = await adminClient().from("products").select("revision").eq("id", productId).single();
    expect((await owner.client.rpc("archive_product", { p_product_id: productId, p_expected_revision: current!.revision })).error).toBeNull();
    const [v1] = await versions();
    const { data } = await adminClient().from("menu_versions").select("snapshot").eq("id", v1.id).single();
    expect(JSON.stringify(data?.snapshot)).toContain("Milanesa");
    await owner.client.rpc("unarchive_product", { p_product_id: productId });
  });
});

describe("cuota de IA", () => {
  beforeEach(async () => {
    await drainQueue();
  });

  it("los límites funcionan con envíos concurrentes", async () => {
    const quotaOwner = await createUser("cuota");
    const quotaBusiness = await createBusiness(quotaOwner, "Cuota de Prueba");
    const admin = adminClient();
    const { data: plan } = await admin
      .from("plans")
      .insert({ code: `test-${randomUUID().slice(0, 8)}`, name: "Prueba 3 fotos", max_branches: 2, max_members: 5, max_menus: 5, ai_pages_per_month: 3, ai_max_pages_per_import: 2 } as never)
      .select("id")
      .single();
    // Asignación con el mismo camino que usa la administración de plataforma.
    const platformAdmin = await createUser("plataforma");
    await admin.from("platform_admins").insert({ user_id: platformAdmin.id, granted_by: "pruebas" } as never);
    const assigned = await admin.rpc("admin_assign_plan", {
      p_actor_id: platformAdmin.id,
      p_business_id: quotaBusiness.businessId,
      p_plan_id: (plan as { id: string }).id,
      p_note: "prueba de cuota",
    });
    expect(assigned.error).toBeNull();
    const notAdmin = await admin.rpc("admin_assign_plan", { p_actor_id: quotaOwner.id, p_business_id: quotaBusiness.businessId, p_plan_id: (plan as { id: string }).id, p_note: "" });
    expect(notAdmin.error?.message).toBe("forbidden");
    // No dejar administradores ni planes de prueba disponibles en la base local.
    await admin.from("platform_admins").delete().eq("user_id", platformAdmin.id);
    await admin.from("plans").update({ is_active: false } as never).eq("id", (plan as { id: string }).id);

    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => submitImport(quotaOwner, quotaBusiness, { seed: `cuota-${i}` }).catch((e) => ({ importId: "", error: e }))));
    const ok = results.filter((r) => !r.error);
    const exceeded = results.filter((r) => r.error && (r.error as { message?: string }).message === "quota_exceeded");
    expect(ok).toHaveLength(3);
    expect(exceeded.length).toBe(3);
    const { data: usage } = await admin.from("ai_usage_months").select("pages_reserved, pages_used").eq("business_id", quotaBusiness.businessId).single();
    expect((usage?.pages_reserved ?? 0) + (usage?.pages_used ?? 0)).toBe(3);
  });
});

describe("invitaciones", () => {
  it("una invitación vencida no se puede usar", async () => {
    const invited = await createUser("vencida");
    const { data } = await owner.client.rpc("create_invitation", {
      p_business_id: business.businessId,
      p_email: invited.email,
      p_role: "editor",
      p_can_publish: false,
      p_all_branches: true,
      p_branch_ids: [],
    });
    const { token, invitation_id } = data as { token: string; invitation_id: string };
    await adminClient()
      .from("invitations")
      .update({ created_at: new Date(Date.now() - 10 * 86400000).toISOString(), expires_at: new Date(Date.now() - 86400000).toISOString() } as never)
      .eq("id", invitation_id);
    const accept = await invited.client.rpc("accept_invitation", { p_token: token });
    expect(accept.error?.message).toBe("invitation_expired");
    const preview = await anonClient().rpc("get_invitation", { p_token: token });
    expect((preview.data as { status: string }).status).toBe("expired");
  });

  it("está atada al email y no se puede reutilizar", async () => {
    const invited = await createUser("invitada");
    const intruder = await createUser("intrusa");
    const { data } = await owner.client.rpc("create_invitation", {
      p_business_id: business.businessId,
      p_email: invited.email,
      p_role: "editor",
      p_can_publish: false,
      p_all_branches: true,
      p_branch_ids: [],
    });
    const { token } = data as { token: string };
    expect((await intruder.client.rpc("accept_invitation", { p_token: token })).error?.message).toBe("invitation_email_mismatch");
    expect((await invited.client.rpc("accept_invitation", { p_token: token })).error).toBeNull();
    expect((await intruder.client.rpc("accept_invitation", { p_token: token })).error?.message).toBe("invitation_used");

    // Si se le revoca el acceso, el mismo enlace no la vuelve a habilitar.
    const { data: membership } = await owner.client.from("memberships").select("id").eq("user_id", invited.id).single();
    await owner.client.rpc("revoke_membership", { p_membership_id: membership!.id });
    await invited.client.rpc("accept_invitation", { p_token: token });
    const { data: after } = await adminClient().from("memberships").select("status").eq("id", membership!.id).single();
    expect(after?.status).toBe("revoked");
  });
});
