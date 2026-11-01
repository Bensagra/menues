"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { themeIssues, themeSchema } from "@/domain/theme";
import { websiteSchema } from "@/domain/website";
import { authedAction, fail, parseInput, rpc, type ActionContext } from "@/server/action";
import { invalidatePublicMenus } from "@/server/cache";

const uuid = z.string().uuid();

async function businessSlugs(supabase: ActionContext["supabase"], businessId: string) {
  const { data } = await supabase.from("branches").select("public_slug").eq("business_id", businessId);
  return (data ?? []).map((b) => b.public_slug);
}

export async function saveWebsiteAction(businessId: string, websiteUrl: string) {
  return authedAction(async ({ supabase }) => {
    const url = parseInput(z.object({ websiteUrl: websiteSchema }), { websiteUrl }).websiteUrl;
    await rpc(supabase, "set_business_website", { p_business_id: parseInput(uuid, businessId), p_website_url: url || null });
    refresh();
    return { websiteUrl: url };
  });
}

/** Guarda el sitio (si cambió) y pide una propuesta nueva al worker. */
export async function requestDesignAction(businessId: string, websiteUrl: string) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, businessId);
    const url = parseInput(z.object({ websiteUrl: websiteSchema }), { websiteUrl }).websiteUrl;
    await rpc(supabase, "set_business_website", { p_business_id: id, p_website_url: url || null });
    const result = await rpc<{ id: string; status: string; replayed: boolean }>(supabase, "request_menu_design", { p_business_id: id });
    refresh();
    return result;
  });
}

export async function designStatusAction(requestId: string) {
  return authedAction(async ({ supabase }) => {
    const { data } = await supabase
      .from("design_requests")
      .select("id, status, attempts, max_attempts, error_message, next_attempt_at")
      .eq("id", parseInput(uuid, requestId))
      .maybeSingle();
    if (!data) fail("not_found");
    return data;
  });
}

export async function applyDesignAction(requestId: string) {
  return authedAction(async ({ supabase }) => {
    const businessId = await rpc<string>(supabase, "apply_menu_design", { p_request_id: parseInput(uuid, requestId) });
    invalidatePublicMenus(await businessSlugs(supabase, businessId));
    refresh();
    return null;
  });
}

/** Guarda el diseño ajustado a mano; null vuelve al diseño estándar. */
export async function saveThemeAction(businessId: string, theme: unknown) {
  return authedAction(async ({ supabase }) => {
    const id = parseInput(uuid, businessId);
    const parsed = theme === null ? null : parseInput(themeSchema, theme);
    if (parsed && themeIssues(parsed).length) fail("theme_not_legible");
    await rpc(supabase, "set_menu_theme", { p_business_id: id, p_theme: parsed });
    invalidatePublicMenus(await businessSlugs(supabase, id));
    refresh();
    return null;
  });
}
