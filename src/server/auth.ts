import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { permissionsFor, type MembershipScope, type Permission, type Role } from "@/domain/permissions";
import { createClient } from "@/server/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/** Usuario verificado (firma del JWT validada por getClaims). null si no hay sesión válida. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: String(data.claims.email ?? "") };
});

export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const params = new URLSearchParams({ motivo: "sesion-vencida" });
    if (returnTo) params.set("volver", returnTo);
    redirect(`/ingresar?${params.toString()}`);
  }
  return user;
}

export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return Boolean(data);
});

export interface BranchSummary {
  id: string;
  name: string;
  public_slug: string;
  timezone: string;
  is_active: boolean;
}

export interface BusinessContext {
  user: CurrentUser;
  business: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    locale: string;
    status: "active" | "suspended";
    brand_color: string | null;
    suspended_reason: string | null;
  };
  scope: MembershipScope & { membershipId: string };
  permissions: Record<Permission, boolean>;
  branches: BranchSummary[];
  activeBranch: BranchSummary | null;
  suspended: boolean;
}

export const BRANCH_COOKIE_PREFIX = "cl_sucursal_";

/**
 * Contexto del negocio para el panel. La pertenencia se resuelve con la sesión
 * y RLS: si el usuario no es miembro, el negocio "no existe" (404).
 */
export const getBusinessContext = cache(async (slug: string): Promise<BusinessContext> => {
  const user = await requireUser(`/panel/${slug}`);
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, slug, currency, locale, status, brand_color, suspended_reason")
    .eq("slug", slug)
    .maybeSingle();
  if (!business) notFound();

  const [{ data: membership }, { data: branches }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, can_publish, all_branches, membership_branches(branch_id)")
      .eq("business_id", business.id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, public_slug, timezone, is_active")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("name"),
  ]);
  if (!membership) notFound();

  const scope: BusinessContext["scope"] = {
    membershipId: membership.id,
    role: membership.role as Role,
    canPublish: membership.can_publish,
    allBranches: membership.all_branches,
    branchIds: (membership.membership_branches ?? []).map((mb) => mb.branch_id),
  };

  const cookieStore = await cookies();
  const preferred = cookieStore.get(`${BRANCH_COOKIE_PREFIX}${business.id}`)?.value;
  const list = (branches ?? []) as BranchSummary[];
  const activeBranch = list.find((b) => b.id === preferred) ?? list[0] ?? null;

  return {
    user,
    business: business as BusinessContext["business"],
    scope,
    permissions: permissionsFor(scope),
    branches: list,
    activeBranch,
    suspended: business.status === "suspended",
  };
});

export interface UserBusiness {
  name: string;
  slug: string;
  status: string;
  role: Role;
}

export const getUserBusinesses = cache(async (): Promise<UserBusiness[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role, businesses(name, slug, status)")
    .eq("user_id", user.id)
    .eq("status", "active");
  return (data ?? [])
    .filter((m) => m.businesses)
    .map((m) => {
      const b = m.businesses as unknown as { name: string; slug: string; status: string };
      return { name: b.name, slug: b.slug, status: b.status, role: m.role as Role };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
});
