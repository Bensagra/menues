"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isLegibleBrandColor } from "@/domain/contrast";
import { isCurrencyCode } from "@/domain/money";
import { isValidSlug } from "@/domain/text";
import { isValidTimezone, timeToMinutes } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { authedAction, fail, parseInput, rpc, type ActionContext } from "@/server/action";
import { invalidatePublicMenus } from "@/server/cache";

const uuid = z.string().uuid();

async function businessSlugs(supabase: ActionContext["supabase"], businessId: string) {
  const { data } = await supabase.from("branches").select("public_slug").eq("business_id", businessId);
  return (data ?? []).map((b) => b.public_slug);
}

// ---------------------------------------------------------------------------
// Local
// ---------------------------------------------------------------------------
const businessSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre del negocio.").max(80),
  description: z.string().trim().max(300, "Máximo 300 caracteres.").default(""),
  brandColor: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === "" || (/^#[0-9A-F]{6}$/.test(v) && isLegibleBrandColor(v)), "Ese color no tiene contraste suficiente con el texto. Elegí uno más oscuro.")
    .default(""),
  currency: z.string().refine(isCurrencyCode, "Elegí una moneda."),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).default("es-AR"),
});

export async function updateBusinessAction(businessId: string, input: z.input<typeof businessSchema>) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, businessId);
    const data = parseInput(businessSchema, input);
    await rpc(supabase, "update_business", {
      p_business_id: id,
      p_name: data.name,
      p_description: data.description,
      p_brand_color: data.brandColor,
      p_currency: data.currency,
      p_locale: data.locale,
    });
    invalidatePublicMenus(await businessSlugs(supabase, id));
    refresh();
    return null;
  });
}

export async function setBusinessMediaAction(businessId: string, kind: "logo" | "cover", mediaId: string | null) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, businessId);
    await rpc(supabase, "set_business_media", {
      p_business_id: id,
      p_kind: parseInput(z.enum(["logo", "cover"]), kind),
      p_media_id: mediaId ? parseInput(uuid, mediaId) : null,
    });
    invalidatePublicMenus(await businessSlugs(supabase, id));
    refresh();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------------
const hoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
  )
  .max(28)
  .superRefine((items, ctx) => {
    items.forEach((item, index) => {
      if (item.open === item.close) ctx.addIssue({ code: "custom", path: [index], message: "La apertura y el cierre no pueden ser iguales." });
    });
    for (let day = 0; day < 7; day++) {
      const ranges = items
        .filter((i) => i.day === day)
        .map((i) => [timeToMinutes(i.open), timeToMinutes(i.close) <= timeToMinutes(i.open) ? timeToMinutes(i.close) + 1440 : timeToMinutes(i.close)])
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i][0] < ranges[i - 1][1]) ctx.addIssue({ code: "custom", path: [], message: "Hay horarios superpuestos en un mismo día." });
      }
    }
  });

const branchSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre de la sucursal.").max(80),
  timezone: z.string().refine(isValidTimezone, "Elegí una zona horaria."),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(40).default(""),
  whatsapp: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine((v) => v === "" || /^\+?\d{8,15}$/.test(v), "Escribí el número con código de país, por ejemplo 5491112345678.")
    .default(""),
  publicNote: z.string().trim().max(300, "Máximo 300 caracteres.").default(""),
  openingHours: hoursSchema.default([]),
});

export async function createBranchAction(businessId: string, input: z.input<typeof branchSchema> & { publicSlug: string }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(branchSchema.extend({ publicSlug: z.string().trim().toLowerCase().refine(isValidSlug, "Usá solo minúsculas, números y guiones.") }), input);
    const id = await rpc<string>(supabase, "create_branch", {
      p_business_id: parseInput(uuid, businessId),
      p_name: data.name,
      p_public_slug: data.publicSlug,
      p_timezone: data.timezone,
      p_address: data.address,
      p_phone: data.phone,
      p_whatsapp: data.whatsapp,
      p_public_note: data.publicNote,
      p_opening_hours: data.openingHours,
    });
    refresh();
    return { branchId: id };
  });
}

export async function updateBranchAction(branchId: string, input: z.input<typeof branchSchema> & { isActive: boolean }) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, branchId);
    const data = parseInput(branchSchema.extend({ isActive: z.boolean() }), input);
    const { data: branch } = await supabase.from("branches").select("public_slug").eq("id", id).maybeSingle();
    if (!branch) fail("not_found");
    await rpc(supabase, "update_branch", {
      p_branch_id: id,
      p_name: data.name,
      p_timezone: data.timezone,
      p_address: data.address,
      p_phone: data.phone,
      p_whatsapp: data.whatsapp,
      p_public_note: data.publicNote,
      p_opening_hours: data.openingHours,
      p_is_active: data.isActive,
    });
    invalidatePublicMenus([branch.public_slug]);
    refresh();
    return null;
  });
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------
const scopeSchema = z.object({
  role: z.enum(["owner", "admin", "editor"]),
  canPublish: z.boolean(),
  allBranches: z.boolean(),
  branchIds: z.array(uuid).max(100),
});

export async function createInvitationAction(businessId: string, input: z.input<typeof scopeSchema> & { email: string }) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(scopeSchema.extend({ email: z.string().trim().toLowerCase().email("Revisá el email.").max(254) }), input);
    const result = await rpc<{ invitation_id: string; token: string; expires_at: string }>(supabase, "create_invitation", {
      p_business_id: parseInput(uuid, businessId),
      p_email: data.email,
      p_role: data.role,
      p_can_publish: data.canPublish,
      p_all_branches: data.allBranches,
      p_branch_ids: data.branchIds,
      p_expires_in_days: 7,
    });
    refresh();
    // El enlace solo se muestra en este momento: en la base se guarda el hash.
    return { link: `${publicEnv().appUrl}/invitacion/${result.token}`, expiresAt: result.expires_at, email: data.email };
  });
}

export async function revokeInvitationAction(invitationId: string) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "revoke_invitation", { p_invitation_id: parseInput(uuid, invitationId) });
    refresh();
    return null;
  });
}

export async function updateMembershipAction(membershipId: string, input: z.input<typeof scopeSchema>) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(scopeSchema, input);
    await rpc(supabase, "update_membership", {
      p_membership_id: parseInput(uuid, membershipId),
      p_role: data.role,
      p_can_publish: data.canPublish,
      p_all_branches: data.allBranches,
      p_branch_ids: data.branchIds,
    });
    refresh();
    return null;
  });
}

export async function revokeMembershipAction(membershipId: string) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "revoke_membership", { p_membership_id: parseInput(uuid, membershipId) });
    refresh();
    return null;
  });
}
