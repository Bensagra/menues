"use server";

import { z } from "zod";
import { isCurrencyCode } from "@/domain/money";
import { isValidSlug } from "@/domain/text";
import { isValidTimezone } from "@/domain/time";
import { authedAction, parseInput, rpc } from "@/server/action";

const slug = z.string().trim().toLowerCase().refine(isValidSlug, "Usá solo minúsculas, números y guiones (de 3 a 60 caracteres).");

const createBusinessSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre del negocio.").max(80),
  slug,
  currency: z.string().refine(isCurrencyCode, "Elegí una moneda."),
  branchName: z.string().trim().min(2, "Escribí un nombre para la sucursal.").max(80),
  branchSlug: slug,
  timezone: z.string().refine(isValidTimezone, "Elegí una zona horaria."),
  address: z.string().trim().max(200).default(""),
});

export async function createBusinessAction(input: z.input<typeof createBusinessSchema>) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(createBusinessSchema, input);
    const result = await rpc<{ business_slug: string; menu_id: string; branch_id: string }>(supabase, "create_business", {
      p_name: data.name,
      p_slug: data.slug,
      p_currency: data.currency,
      p_branch_name: data.branchName,
      p_branch_slug: data.branchSlug,
      p_timezone: data.timezone,
      p_address: data.address,
      p_menu_name: "Carta",
    });
    return { businessSlug: result.business_slug, menuId: result.menu_id };
  });
}

export async function checkSlugAction(kind: "business" | "branch", value: string) {
  return authedAction(async ({ supabase }) => {
    const parsed = slug.safeParse(value);
    if (!parsed.success) return { available: false, valid: false };
    const available = await rpc<boolean>(supabase, "slug_available", { p_kind: kind, p_slug: parsed.data });
    return { available, valid: true };
  });
}

export async function acceptInvitationByIdAction(invitationId: string) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(z.string().uuid(), invitationId);
    const result = await rpc<{ business_slug: string }>(supabase, "accept_invitation_by_id", { p_invitation_id: id });
    return { businessSlug: result.business_slug };
  });
}

export async function acceptInvitationAction(token: string) {
  return authedAction(async ({ supabase }) => {
    const value = parseInput(z.string().min(20).max(100), token);
    const result = await rpc<{ business_slug: string }>(supabase, "accept_invitation", { p_token: value });
    return { businessSlug: result.business_slug };
  });
}
