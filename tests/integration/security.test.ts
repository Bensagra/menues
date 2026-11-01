import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, rolePermits, type Role } from "@/domain/permissions";
import pg from "pg";
import {
  addMember,
  adminClient,
  anonClient,
  createBusiness,
  createCategory,
  createUser,
  publicMenu,
  publish,
  saveProduct,
  type TestBusiness,
  type TestUser,
} from "./helpers";

async function sql() {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  return client;
}

let ownerA: TestUser;
let ownerB: TestUser;
let businessA: TestBusiness;
let businessB: TestBusiness;
let categoryB: string;
let productB: string;

beforeAll(async () => {
  ownerA = await createUser("duenoA");
  ownerB = await createUser("duenoB");
  businessA = await createBusiness(ownerA, "Negocio A");
  businessB = await createBusiness(ownerB, "Negocio B");
  categoryB = await createCategory(ownerB, businessB.menuId, "Principales");
  const { data, error } = await saveProduct(ownerB, { menuId: businessB.menuId, categoryId: categoryB, name: "Plato secreto de B", price: 150000 });
  if (error) throw error;
  productB = (data as { id: string }).id;
});

describe("aislamiento entre negocios", () => {
  it("un usuario del negocio A no puede leer datos privados del negocio B", async () => {
    const tables = ["businesses", "branches", "menus", "categories", "products", "memberships", "imports", "audit_log", "media"] as const;
    for (const table of tables) {
      const column = table === "businesses" ? "id" : "business_id";
      const { data, error } = await ownerA.client.from(table).select("*").eq(column as never, businessB.businessId as never);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: product } = await ownerA.client.from("products").select("id").eq("id", productB);
    expect(product).toEqual([]);
  });

  it("un usuario del negocio A no puede modificar datos del negocio B", async () => {
    const edit = await saveProduct(ownerA, { id: productB, menuId: businessB.menuId, categoryId: categoryB, name: "Hackeado", price: 1 });
    expect(edit.error?.message).toBe("not_found");

    const status = await ownerA.client.rpc("set_product_status", { p_product_id: productB, p_status: "hidden" });
    expect(status.error?.message).toBe("not_found");

    const pub = await publish(ownerA, businessB.menuId, [businessB.branchId]);
    expect(pub.error?.message).toBe("not_found");

    const update = await ownerA.client.rpc("update_business", {
      p_business_id: businessB.businessId,
      p_name: "Robado",
      p_description: "",
      p_brand_color: "",
      p_currency: "ARS",
      p_locale: "es-AR",
    });
    expect(update.error?.message).toBe("not_found");

    const invite = await ownerA.client.rpc("create_invitation", {
      p_business_id: businessB.businessId,
      p_email: "intruso@pruebas.test",
      p_role: "owner",
      p_can_publish: true,
      p_all_branches: true,
      p_branch_ids: [],
    });
    expect(invite.error?.message).toBe("not_found");

    // Mezclar entidades: crear un producto en el menú propio con una categoría de B.
    const mixed = await saveProduct(ownerA, { menuId: businessA.menuId, categoryId: categoryB, name: "Mezcla" });
    expect(mixed.error?.message).toBe("invalid_category");

    const { data: unchanged } = await adminClient().from("products").select("name, status").eq("id", productB).single();
    expect(unchanged).toEqual({ name: "Plato secreto de B", status: "available" });
  });

  it("los usuarios autenticados no tienen escritura directa sobre tablas", async () => {
    const insert = await ownerA.client.from("products").insert({
      business_id: businessA.businessId,
      menu_id: businessA.menuId,
      category_id: categoryB,
      name: "Directo",
    } as never);
    expect(insert.error).not.toBeNull();
    const update = await ownerA.client.from("memberships").update({ role: "owner" } as never).eq("user_id", ownerA.id);
    expect(update.error).not.toBeNull();
    const admin = await ownerA.client.from("platform_admins").insert({ user_id: ownerA.id, granted_by: "yo" } as never);
    expect(admin.error).not.toBeNull();
  });
});

describe("visitantes sin sesión", () => {
  it("no pueden leer tablas ni borradores", async () => {
    const anon = anonClient();
    for (const table of ["products", "menus", "businesses", "menu_versions", "imports", "import_images"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(data === null || data.length === 0, table).toBe(true);
      expect(error, table).not.toBeNull();
    }
  });

  it("la carta pública solo muestra lo publicado", async () => {
    expect((await publicMenu(businessB.branchSlug)).status).toBe("unpublished");
    const first = await publish(ownerB, businessB.menuId, [businessB.branchId]);
    expect(first.error).toBeNull();
    let menu = await publicMenu(businessB.branchSlug);
    expect(menu.status).toBe("ok");
    expect(menu.menus[0].snapshot.categories[0].products.map((p) => p.name)).toEqual(["Plato secreto de B"]);

    // Cambio en borrador: el público no lo ve hasta publicar.
    const { data: current } = await adminClient().from("products").select("revision").eq("id", productB).single();
    await saveProduct(ownerB, { id: productB, menuId: businessB.menuId, categoryId: categoryB, name: "Plato renombrado", price: 160000, expectedRevision: current!.revision });
    menu = await publicMenu(businessB.branchSlug);
    expect(menu.menus[0].snapshot.categories[0].products[0]).toMatchObject({ name: "Plato secreto de B", price_minor: 150000 });
    await publish(ownerB, businessB.menuId, [businessB.branchId]);
    menu = await publicMenu(businessB.branchSlug);
    expect(menu.menus[0].snapshot.categories[0].products[0]).toMatchObject({ name: "Plato renombrado", price_minor: 160000 });
  });

  it("no pueden descargar fotos privadas de importación", async () => {
    const admin = adminClient();
    const path = `${businessB.businessId}/prueba/privada.jpg`;
    await admin.storage.from("import-originals").upload(path, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg", upsert: true });
    const { data, error } = await anonClient().storage.from("import-originals").download(path);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const fromOtherTenant = await ownerA.client.storage.from("import-originals").download(path);
    expect(fromOtherTenant.data).toBeNull();
    const listing = await ownerA.client.storage.from("import-originals").list(businessB.businessId);
    expect(listing.data ?? []).toEqual([]);
  });

  it("solo pueden ejecutar las funciones públicas permitidas", async () => {
    const db = await sql();
    try {
      const { rows: functions } = await db.query(
        `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`,
      );
      expect(functions.map((r) => r.proname)).toEqual(["get_invitation", "get_public_menu"]);
      const { rows: anonTables } = await db.query(
        "select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'",
      );
      expect(anonTables).toEqual([]);
      const { rows: authPrivileges } = await db.query(
        "select distinct privilege_type from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'",
      );
      expect(authPrivileges.map((r) => r.privilege_type)).toEqual(["SELECT"]);
    } finally {
      await db.end();
    }
    const anon = anonClient();
    const allowed = await anon.rpc("get_invitation", { p_token: "x".repeat(30) });
    expect(allowed.error).toBeNull();
    for (const fn of ["create_business", "publish_menu", "save_product", "worker_claim_import", "server_submit_import", "admin_set_business_status"]) {
      const { error } = await anon.rpc(fn as never, {} as never);
      expect(error, fn).not.toBeNull();
    }
    const worker = await ownerA.client.rpc("worker_claim_import", { p_worker_id: "intruso", p_lease_seconds: 60 });
    expect(worker.error).not.toBeNull();
    const grant = await ownerA.client.rpc("server_grant_platform_admin", { p_email: ownerA.email, p_granted_by: "yo" });
    expect(grant.error).not.toBeNull();
  });

  it("los usuarios autenticados no ejecutan funciones de servidor, worker ni plataforma", async () => {
    const db = await sql();
    try {
      const { rows } = await db.query(
        `select distinct n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'app') and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`,
      );
      const names = rows.map((r) => r.fn as string);
      expect(names.filter((name) => /^public\.(admin|server|worker)_/.test(name))).toEqual([]);
      expect(names.filter((name) => name.startsWith("app."))).toEqual([
        "app.can_access_branch",
        "app.can_view_menu",
        "app.has_permission",
        "app.is_member",
        "app.is_platform_admin",
        "app.role_permits",
        "app.shares_business",
      ]);
    } finally {
      await db.end();
    }
    const listing = await ownerA.client.rpc("admin_list_users", { p_actor_id: ownerA.id, p_query: "", p_limit: 10, p_offset: 0 });
    expect(listing.error).not.toBeNull();
  });

  it("una función creada en una migración nueva nace sin permisos para anon y authenticated", async () => {
    const db = await sql();
    try {
      await db.query("begin");
      await db.query("create function public.zz_probe_default_privileges() returns int language sql as 'select 1'");
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.zz_probe_default_privileges()', 'EXECUTE') as anon,
                has_function_privilege('authenticated', 'public.zz_probe_default_privileges()', 'EXECUTE') as authenticated`,
      );
      expect(rows[0]).toEqual({ anon: false, authenticated: false });
    } finally {
      await db.query("rollback");
      await db.end();
    }
  });
});

describe("roles y permisos", () => {
  it("la matriz de permisos de la base coincide con la de la aplicación", async () => {
    const db = await sql();
    try {
      const roles: Role[] = ["owner", "admin", "editor"];
      for (const role of roles) {
        for (const canPublish of [false, true]) {
          for (const permission of PERMISSIONS) {
            const { rows } = await db.query("select app.role_permits($1, $2, $3) as ok", [role, canPublish, permission]);
            expect(rows[0].ok, `${role}/${canPublish}/${permission}`).toBe(rolePermits(role, canPublish, permission));
          }
        }
      }
    } finally {
      await db.end();
    }
  });

  it("un editor sin permiso de publicar puede editar el borrador pero no publicar", async () => {
    const editor = await addMember(ownerB, businessB, "editor", { canPublish: false });
    const category = await createCategory(editor, businessB.menuId, "Postres del editor");
    const product = await saveProduct(editor, { menuId: businessB.menuId, categoryId: category, name: "Flan", price: 50000 });
    expect(product.error).toBeNull();
    const pub = await publish(editor, businessB.menuId, [businessB.branchId]);
    expect(pub.error?.message).toBe("forbidden");
    const restore = await editor.client.rpc("restore_menu_version", {
      p_version_id: "00000000-0000-0000-0000-000000000000",
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(restore.error).not.toBeNull();
  });

  it("nadie puede otorgarse roles superiores ni cambiar su propia autorización", async () => {
    const admin = await addMember(ownerB, businessB, "admin");
    const { data: own } = await admin.client.from("memberships").select("id").eq("user_id", admin.id).single();
    const self = await admin.client.rpc("update_membership", {
      p_membership_id: own!.id,
      p_role: "owner",
      p_can_publish: true,
      p_all_branches: true,
      p_branch_ids: [],
    });
    expect(self.error?.message).toBe("cannot_modify_self");

    const inviteAdmin = await admin.client.rpc("create_invitation", {
      p_business_id: businessB.businessId,
      p_email: "otro-admin@pruebas.test",
      p_role: "admin",
      p_can_publish: true,
      p_all_branches: true,
      p_branch_ids: [],
    });
    expect(inviteAdmin.error?.message).toBe("role_not_grantable");

    const { data: ownerMembership } = await ownerB.client.from("memberships").select("id").eq("user_id", ownerB.id).single();
    const demote = await admin.client.rpc("update_membership", {
      p_membership_id: ownerMembership!.id,
      p_role: "editor",
      p_can_publish: false,
      p_all_branches: true,
      p_branch_ids: [],
    });
    expect(demote.error?.message).toBe("forbidden");

    const lastOwner = await ownerB.client.rpc("revoke_membership", { p_membership_id: ownerMembership!.id });
    expect(lastOwner.error?.message).toBe("cannot_modify_self");
  });

  it("un editor con sucursales asignadas no ve otras sucursales", async () => {
    const { data: branchId } = await ownerB.client.rpc("create_branch", {
      p_business_id: businessB.businessId,
      p_name: "Norte",
      p_public_slug: `norte-${businessB.slug}`.slice(0, 60),
      p_timezone: "America/Argentina/Buenos_Aires",
      p_address: "",
      p_phone: "",
      p_whatsapp: "",
      p_public_note: "",
      p_opening_hours: [],
    });
    const editor = await addMember(ownerB, businessB, "editor", { branchIds: [branchId as string], allBranches: false, canPublish: true });
    const { data: branches } = await editor.client.from("branches").select("id").eq("business_id", businessB.businessId);
    expect(branches?.map((b) => b.id)).toEqual([branchId]);
    // El menú principal solo está en "Centro": el editor de "Norte" no lo ve ni lo publica.
    const { data: menus } = await editor.client.from("menus").select("id").eq("id", businessB.menuId);
    expect(menus).toEqual([]);
    const pub = await publish(editor, businessB.menuId, [businessB.branchId]);
    expect(pub.error?.message).toBe("not_found");
  });
});
