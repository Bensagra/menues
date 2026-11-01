"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isCurrencyCode } from "@/domain/money";
import { isValidSlug } from "@/domain/text";
import { isValidTimezone } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { appError } from "@/lib/errors";
import type { ActionResult } from "@/lib/action-result";
import { ActionFailure, fromPostgrest, parseInput } from "@/server/action";
import { requirePlatformAdmin } from "@/server/admin";
import { invalidatePublicMenus } from "@/server/cache";

const uuid = z.string().uuid();

/** Acción de plataforma: verifica el rol en cada llamada y usa el actor de la sesión. */
async function adminAction<T>(fn: (ctx: NonNullable<Awaited<ReturnType<typeof requirePlatformAdmin>>>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const ctx = await requirePlatformAdmin();
    if (!ctx) return { ok: false, error: appError("forbidden") };
    return { ok: true, data: await fn(ctx) };
  } catch (error) {
    if (error instanceof ActionFailure) return { ok: false, error: error.error, fieldErrors: error.fieldErrors };
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[admin] error inesperado", error instanceof Error ? error.message : error);
    return { ok: false, error: appError("unknown") };
  }
}

async function call<T>(db: { rpc: unknown }, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (db as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: never }> }).rpc(fn, args);
  if (error) throw new ActionFailure(fromPostgrest(error));
  return data as T;
}

const slug = z.string().trim().toLowerCase().refine(isValidSlug, "Usá solo minúsculas, números y guiones (de 3 a 60 caracteres).");

export async function adminCreateBusinessAction(input: {
  name: string;
  slug: string;
  currency: string;
  branchName: string;
  branchSlug: string;
  timezone: string;
  ownerEmail: string;
  planId: string | null;
}) {
  return adminAction(async ({ db, user }) => {
    const data = parseInput(
      z.object({
        name: z.string().trim().min(2).max(80),
        slug,
        currency: z.string().refine(isCurrencyCode),
        branchName: z.string().trim().min(2).max(80),
        branchSlug: slug,
        timezone: z.string().refine(isValidTimezone),
        ownerEmail: z.string().trim().toLowerCase().email("Revisá el email."),
        planId: uuid.nullable(),
      }),
      input,
    );
    const result = await call<{ business_id: string; token: string }>(db, "admin_create_business", {
      p_actor_id: user.id,
      p_name: data.name,
      p_slug: data.slug,
      p_currency: data.currency,
      p_branch_name: data.branchName,
      p_branch_slug: data.branchSlug,
      p_timezone: data.timezone,
      p_owner_email: data.ownerEmail,
      p_plan_id: data.planId,
    });
    refresh();
    return { businessId: result.business_id, link: `${publicEnv().appUrl}/invitacion/${result.token}` };
  });
}

export async function adminInviteOwnerAction(businessId: string, email: string) {
  return adminAction(async ({ db, user }) => {
    const result = await call<{ token: string }>(db, "admin_invite_owner", {
      p_actor_id: user.id,
      p_business_id: parseInput(uuid, businessId),
      p_email: parseInput(z.string().trim().toLowerCase().email("Revisá el email."), email),
    });
    refresh();
    return { link: `${publicEnv().appUrl}/invitacion/${result.token}` };
  });
}

export async function adminBusinessImpactAction(businessId: string) {
  return adminAction(async ({ db, user }) =>
    call<{ public_branches: { name: string; public_slug: string; published: boolean }[]; members: number; queued_imports: number; reviews_pending: number }>(
      db,
      "admin_business_impact",
      { p_actor_id: user.id, p_business_id: parseInput(uuid, businessId) },
    ),
  );
}

export async function adminSetBusinessStatusAction(businessId: string, status: "active" | "suspended", reason: string) {
  return adminAction(async ({ db, user }) => {
    const result = await call<{ branch_slugs: string[] }>(db, "admin_set_business_status", {
      p_actor_id: user.id,
      p_business_id: parseInput(uuid, businessId),
      p_status: parseInput(z.enum(["active", "suspended"]), status),
      p_reason: parseInput(z.string().trim().max(300), reason ?? ""),
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return null;
  });
}

export async function adminAssignPlanAction(businessId: string, planId: string, note: string) {
  return adminAction(async ({ db, user }) => {
    await call(db, "admin_assign_plan", {
      p_actor_id: user.id,
      p_business_id: parseInput(uuid, businessId),
      p_plan_id: parseInput(uuid, planId),
      p_note: parseInput(z.string().trim().max(300), note ?? ""),
    });
    refresh();
    return null;
  });
}

const planSchema = z.object({
  id: uuid.nullable(),
  code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Usá minúsculas, números y guiones."),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  max_branches: z.number().int().min(1).max(1000),
  max_members: z.number().int().min(1).max(1000),
  max_menus: z.number().int().min(1).max(1000),
  ai_pages_per_month: z.number().int().min(0).max(100000),
  ai_max_pages_per_import: z.number().int().min(1).max(30),
  is_active: z.boolean(),
});

export async function adminSavePlanAction(input: z.input<typeof planSchema>) {
  return adminAction(async ({ db, user }) => {
    const plan = parseInput(planSchema, input);
    const id = await call<string>(db, "admin_save_plan", { p_actor_id: user.id, p_plan: plan });
    refresh();
    return { id };
  });
}

export async function adminRetryImportAction(importId: string) {
  return adminAction(async ({ db, user }) => {
    const result = await call<{ requeued: boolean; status: string }>(db, "admin_retry_import", { p_actor_id: user.id, p_import_id: parseInput(uuid, importId) });
    refresh();
    return result;
  });
}
