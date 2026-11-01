import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, createBusiness, createCategory, createUser, publicMenu, publish, saveProduct, type TestBusiness, type TestUser } from "./helpers";
import { TestProvider, drainQueue, importRow, item, page, processWith, proposals, submitImport } from "./import-helpers";

let owner: TestUser;
let business: TestBusiness;
let postres: string;
let flanId: string;
let tiramisuId: string;
let panquequesId: string;

async function product(id: string) {
  const { data } = await adminClient().from("products").select("name, description, price_minor, status, archived_at, revision").eq("id", id).single();
  return data!;
}

async function productCount() {
  const { count } = await adminClient()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("menu_id", business.menuId)
    .is("archived_at", null);
  return count ?? 0;
}

beforeAll(async () => {
  owner = await createUser("importa");
  business = await createBusiness(owner, "Bodegón de Prueba");
  postres = await createCategory(owner, business.menuId, "Postres");
  const flan = await saveProduct(owner, { menuId: business.menuId, categoryId: postres, name: "Flan casero", price: 720000, description: "Con dulce de leche." });
  const tiramisu = await saveProduct(owner, { menuId: business.menuId, categoryId: postres, name: "Tiramisú", price: 840000 });
  const panqueques = await saveProduct(owner, { menuId: business.menuId, categoryId: postres, name: "Panqueques", price: 780000 });
  flanId = (flan.data as { id: string }).id;
  tiramisuId = (tiramisu.data as { id: string }).id;
  panquequesId = (panqueques.data as { id: string }).id;
  const pub = await publish(owner, business.menuId, [business.branchId]);
  if (pub.error) throw pub.error;
});

beforeEach(async () => {
  await drainQueue();
});

describe("importación con fotos", () => {
  it("una foto parcial no elimina productos y una importación repetida no los duplica", async () => {
    const extraction = page([{ name: "Postres", items: [item("Flan casero", "$ 7.900", "7900"), item("Volcán de chocolate", "$ 9.500", "9500")] }]);
    const first = await submitImport(owner, business, { seed: "parcial-1" });
    expect(first.error).toBeNull();
    await processWith(first.importId, new TestProvider(extraction));
    expect((await importRow(first.importId)).status).toBe("needs_review");

    const kinds = (await proposals(first.importId)).map((p) => p.kind).sort();
    expect(kinds).toEqual(["new_product", "price_change"]);
    const approved = await owner.client.rpc("bulk_decide_proposals", { p_import_id: first.importId, p_decision: "approve" });
    expect(approved.data).toBe(2);
    const applied = await owner.client.rpc("apply_import", { p_import_id: first.importId });
    expect(applied.error).toBeNull();
    expect(applied.data).toMatchObject({ status: "applied", applied: 2 });

    // Nada se borró ni se ocultó por no aparecer en la foto.
    expect(await productCount()).toBe(4);
    expect(await product(tiramisuId)).toMatchObject({ archived_at: null, status: "available", price_minor: 840000 });
    expect(await product(panquequesId)).toMatchObject({ archived_at: null, status: "available" });
    expect(await product(flanId)).toMatchObject({ price_minor: 790000, description: "Con dulce de leche." });

    // Aplicar de nuevo no duplica cambios.
    const replay = await owner.client.rpc("apply_import", { p_import_id: first.importId });
    expect(replay.data).toMatchObject({ status: "applied", replayed: true });
    expect(await productCount()).toBe(4);

    // Repetir la misma foto no crea productos duplicados.
    const second = await submitImport(owner, business, { seed: "parcial-2" });
    await processWith(second.importId, new TestProvider(extraction));
    const again = await proposals(second.importId);
    expect(again.some((p) => p.kind === "new_product")).toBe(false);
    expect(again.every((p) => p.kind === "no_change")).toBe(true);
  });

  it("un precio ilegible nunca se convierte en cero", async () => {
    const before = await product(tiramisuId);
    const run = await submitImport(owner, business, { seed: "ilegible" });
    await processWith(run.importId, new TestProvider(page([{ name: "Postres", items: [item("Tiramisú", "$ 8.?00", null, { illegible_fields: ["price"] })] }])));
    const [illegible] = await proposals(run.importId);
    expect(illegible).toMatchObject({ kind: "illegible", proposed_value: null, needs_review: true });

    // La aprobación en conjunto no incluye datos ilegibles y la aplicación queda bloqueada.
    expect((await owner.client.rpc("bulk_decide_proposals", { p_import_id: run.importId, p_decision: "approve" })).data).toBe(0);
    expect((await owner.client.rpc("apply_import", { p_import_id: run.importId })).error?.message).toBe("pending_decisions");
    // Aprobar sin escribir el dato no está permitido.
    expect((await owner.client.rpc("decide_proposal", { p_proposal_id: illegible.id, p_decision: "approve" })).error?.message).toBe("correction_required");

    await owner.client.rpc("decide_proposal", { p_proposal_id: illegible.id, p_decision: "reject" });
    expect((await owner.client.rpc("apply_import", { p_import_id: run.importId })).error).toBeNull();
    expect((await product(tiramisuId)).price_minor).toBe(before.price_minor);
  });

  it("corregir un dato ilegible aplica el valor escrito", async () => {
    const run = await submitImport(owner, business, { seed: "corregir" });
    await processWith(run.importId, new TestProvider(page([{ name: "Postres", items: [item("Panqueques", "$ 8.?00", null, { illegible_fields: ["price"] })] }])));
    const [illegible] = await proposals(run.importId);
    const decision = await owner.client.rpc("decide_proposal", { p_proposal_id: illegible.id, p_decision: "approve", p_correction: { resolution: "same", price_minor: 810000 } });
    expect(decision.error).toBeNull();
    const applied = await owner.client.rpc("apply_import", { p_import_id: run.importId });
    expect(applied.error).toBeNull();
    expect((await product(panquequesId)).price_minor).toBe(810000);
  });

  it("«Solo precios» no modifica nombres ni agrega productos", async () => {
    const before = await product(flanId);
    const run = await submitImport(owner, business, { scope: "prices_only", seed: "solo-precios" });
    await processWith(
      run.importId,
      new TestProvider(
        page([
          {
            name: "Postres",
            items: [
              item("Flan casero", "$ 8.100", "8100", { description: "Descripción nueva que no debe aplicarse" }),
              item("Torta nueva", "$ 9.000", "9000"),
              item("Tiramisu clasico", "$ 9.200", "9200"),
            ],
          },
        ]),
      ),
    );
    const list = await proposals(run.importId);
    expect(list.find((p) => p.kind === "not_found")?.applicable).toBe(false);
    expect(list.some((p) => p.kind === "description_change" || p.kind === "new_product")).toBe(false);
    const uncertain = list.find((p) => p.kind === "uncertain_match")!;
    expect(uncertain).toBeTruthy();
    expect(Object.keys(uncertain.proposed_value as object)).toEqual(["price_minor"]);

    // Intentar colar un cambio de nombre en la corrección se rechaza.
    const sneaky = await owner.client.rpc("decide_proposal", { p_proposal_id: uncertain.id, p_decision: "approve", p_correction: { resolution: "same", name: "Renombrado" } });
    expect(sneaky.error?.message).toBe("correction_field_not_allowed");
    await owner.client.rpc("decide_proposal", { p_proposal_id: uncertain.id, p_decision: "approve", p_correction: { resolution: "same", price_minor: 920000 } });
    await owner.client.rpc("bulk_decide_proposals", { p_import_id: run.importId, p_decision: "approve" });
    const applied = await owner.client.rpc("apply_import", { p_import_id: run.importId });
    expect(applied.error).toBeNull();

    const after = await product(flanId);
    expect(after.name).toBe(before.name);
    expect(after.description).toBe(before.description);
    expect(after.price_minor).toBe(810000);
    expect((await product(tiramisuId)).name).toBe("Tiramisú");
    expect((await product(tiramisuId)).price_minor).toBe(920000);
    const { count } = await adminClient().from("products").select("id", { count: "exact", head: true }).eq("menu_id", business.menuId).eq("name", "Torta nueva");
    expect(count).toBe(0);
  });

  it("detecta conflictos cuando alguien edita un producto durante la revisión", async () => {
    const run = await submitImport(owner, business, { seed: "conflicto" });
    await processWith(run.importId, new TestProvider(page([{ name: "Postres", items: [item("Panqueques", "$ 8.500", "8500")] }])));
    const [change] = await proposals(run.importId);
    expect(change.kind).toBe("price_change");

    // Otra persona edita el producto mientras tanto.
    const current = await product(panquequesId);
    const edit = await saveProduct(owner, { id: panquequesId, menuId: business.menuId, categoryId: postres, name: "Panqueques", price: 830000, expectedRevision: current.revision });
    expect(edit.error).toBeNull();

    await owner.client.rpc("decide_proposal", { p_proposal_id: change.id, p_decision: "approve" });
    const firstApply = await owner.client.rpc("apply_import", { p_import_id: run.importId });
    expect(firstApply.data).toMatchObject({ status: "conflicts" });
    expect((await product(panquequesId)).price_minor).toBe(830000);
    const [conflicted] = await proposals(run.importId);
    expect(conflicted.status).toBe("conflict");
    expect((conflicted.current_value as { price_minor: number }).price_minor).toBe(830000);

    // Resolver explícitamente: aplicar igual la versión detectada.
    await owner.client.rpc("decide_proposal", { p_proposal_id: change.id, p_decision: "approve" });
    const secondApply = await owner.client.rpc("apply_import", { p_import_id: run.importId });
    expect(secondApply.data).toMatchObject({ status: "applied" });
    expect((await product(panquequesId)).price_minor).toBe(850000);
  });

  it("los fallos del proveedor no afectan la carta publicada ni consumen cuota", async () => {
    const before = await publicMenu(business.branchSlug);
    const run = await submitImport(owner, business, { seed: "falla" });
    const provider = new TestProvider({ fail: "unavailable" });
    await processWith(run.importId, provider);
    let row = await importRow(run.importId);
    expect(row.status).toBe("pending");
    expect(row.stage).toBe("retry_wait");
    expect(row.error_message).toMatch(/no está disponible/);

    for (let attempt = 0; attempt < 5 && row.status === "pending"; attempt++) {
      await processWith(run.importId, provider);
      row = await importRow(run.importId);
    }
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(row.max_attempts);
    expect(row.quota_settled).toBe(true);

    const { data: usage } = await adminClient().from("ai_usage_months").select("pages_reserved").eq("business_id", business.businessId).single();
    expect(usage?.pages_reserved).toBe(0);
    expect(await publicMenu(business.branchSlug)).toEqual(before);

    // Un error definitivo (credencial inválida) no se reintenta.
    const auth = await submitImport(owner, business, { seed: "falla-auth" });
    await processWith(auth.importId, new TestProvider({ fail: "auth" }));
    expect((await importRow(auth.importId)).status).toBe("failed");
  });

  it("cancelar libera la cuota reservada", async () => {
    const run = await submitImport(owner, business, { seed: "cancelar" });
    const { data: reserved } = await adminClient().from("ai_usage_months").select("pages_reserved").eq("business_id", business.businessId).single();
    expect(reserved?.pages_reserved).toBeGreaterThan(0);
    expect((await owner.client.rpc("cancel_import", { p_import_id: run.importId })).error).toBeNull();
    const { data: after } = await adminClient().from("ai_usage_months").select("pages_reserved").eq("business_id", business.businessId).single();
    expect(after?.pages_reserved).toBe(0);
    expect((await importRow(run.importId)).status).toBe("cancelled");
  });

  it("no se puede enviar dos veces la misma foto mientras está en curso", async () => {
    const first = await submitImport(owner, business, { seed: "duplicada" });
    expect(first.error).toBeNull();
    const second = await submitImport(owner, business, { seed: "duplicada" });
    expect(second.error?.message).toBe("duplicate_import");
    await owner.client.rpc("cancel_import", { p_import_id: first.importId });
  });

  it("cancela las subidas abandonadas y borra sus fotos, sin tocar las recientes", async () => {
    const admin = adminClient();
    const create = () =>
      owner.client.rpc("create_import", {
        p_menu_id: business.menuId,
        p_branch_ids: [business.branchId],
        p_scope: "full",
        p_category_ids: [],
        p_files: [{ name: "carta.jpg", type: "image/jpeg", size: 1000 }],
        p_idempotency_key: crypto.randomUUID(),
      });
    const stale = (await create()).data as { import_id: string; images: { storage_path: string }[] };
    const fresh = (await create()).data as { import_id: string };
    await admin.storage.from("import-originals").upload(stale.images[0].storage_path, new Uint8Array([1, 2, 3]), { contentType: "image/jpeg", upsert: true });
    await admin.from("imports").update({ created_at: new Date(Date.now() - 3 * 3600_000).toISOString() } as never).eq("id", stale.import_id);

    const denied = await owner.client.rpc("worker_expire_uploads" as never, { p_older_than_minutes: 60, p_limit: 100 } as never);
    expect(denied.error).not.toBeNull();

    const { data, error } = await admin.rpc("worker_expire_uploads", { p_older_than_minutes: 60, p_limit: 100 });
    expect(error).toBeNull();
    const result = data as { expired: number; paths: string[] };
    expect(result.paths).toContain(stale.images[0].storage_path);
    expect((await importRow(stale.import_id)).status).toBe("cancelled");
    expect((await importRow(fresh.import_id)).status).toBe("uploading");
    await admin.from("imports").update({ status: "cancelled", stage: "cancelled", cancelled_at: new Date().toISOString() } as never).eq("id", fresh.import_id);
  });
});
