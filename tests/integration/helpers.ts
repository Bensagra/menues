import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type Client = SupabaseClient<Database>;

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = () => process.env.SUPABASE_SECRET_KEY!;

export function adminClient(): Client {
  return createClient<Database>(url(), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): Client {
  return createClient<Database>(url(), anonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export interface TestUser {
  id: string;
  email: string;
  client: Client;
}

/** Crea un usuario confirmado y devuelve un cliente con su sesión (RLS aplica). */
export async function createUser(label = "user"): Promise<TestUser> {
  const email = `${unique(label)}@pruebas.test`;
  const password = `Clave-${randomUUID()}1a`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: label } });
  if (error || !data.user) throw error ?? new Error("no se creó el usuario");
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export interface TestBusiness {
  businessId: string;
  slug: string;
  branchId: string;
  branchSlug: string;
  menuId: string;
}

export async function createBusiness(owner: TestUser, name = "Negocio de prueba"): Promise<TestBusiness> {
  const slug = unique("neg");
  const branchSlug = unique("suc");
  const { data, error } = await owner.client.rpc("create_business", {
    p_name: name,
    p_slug: slug,
    p_currency: "ARS",
    p_branch_name: "Centro",
    p_branch_slug: branchSlug,
    p_timezone: "America/Argentina/Buenos_Aires",
  });
  if (error) throw error;
  const result = data as { business_id: string; branch_id: string; menu_id: string };
  return { businessId: result.business_id, slug, branchId: result.branch_id, branchSlug, menuId: result.menu_id };
}

export async function createCategory(user: TestUser, menuId: string, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_category", { p_menu_id: menuId, p_name: name });
  if (error) throw error;
  return data as string;
}

export async function saveProduct(
  user: TestUser,
  payload: {
    id?: string | null;
    menuId: string;
    categoryId: string;
    name: string;
    price?: number | null;
    description?: string;
    status?: string;
    expectedRevision?: number;
    variants?: { id?: string | null; name: string; price_minor: number | null }[];
  },
) {
  return user.client.rpc("save_product", {
    p_payload: {
      id: payload.id ?? null,
      menu_id: payload.menuId,
      category_id: payload.categoryId,
      name: payload.name,
      description: payload.description ?? "",
      price_minor: payload.price ?? null,
      status: payload.status ?? "available",
      tags: [],
      image_media_id: null,
      variants: payload.variants ?? [],
      extras: [],
      ...(payload.expectedRevision !== undefined ? { expected_revision: payload.expectedRevision } : {}),
    },
  });
}

export async function publish(user: TestUser, menuId: string, branchIds: string[], key = randomUUID()) {
  return user.client.rpc("publish_menu", { p_menu_id: menuId, p_branch_ids: branchIds, p_idempotency_key: key });
}

export async function publicMenu(slug: string) {
  const { data, error } = await anonClient().rpc("get_public_menu", { p_slug: slug });
  if (error) throw error;
  return data as {
    status: string;
    menus: { version_number: number; snapshot: { categories: { name: string; products: { name: string; price_minor: number | null }[] }[] } }[];
  };
}

/** Invita y acepta: devuelve el nuevo miembro con su sesión. */
export async function addMember(
  owner: TestUser,
  business: TestBusiness,
  role: "admin" | "editor",
  options: { canPublish?: boolean; branchIds?: string[]; allBranches?: boolean } = {},
): Promise<TestUser> {
  const member = await createUser(role);
  const { data, error } = await owner.client.rpc("create_invitation", {
    p_business_id: business.businessId,
    p_email: member.email,
    p_role: role,
    p_can_publish: options.canPublish ?? false,
    p_all_branches: options.allBranches ?? !options.branchIds,
    p_branch_ids: options.branchIds ?? [],
  });
  if (error) throw error;
  const { error: acceptError } = await member.client.rpc("accept_invitation", { p_token: (data as { token: string }).token });
  if (acceptError) throw acceptError;
  return member;
}
