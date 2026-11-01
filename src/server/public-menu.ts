import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { snapshotSchema } from "@/domain/snapshot";
import { parseTheme } from "@/domain/theme";
import { createAnonClient } from "@/lib/supabase/service";
import { publicMenuTag } from "@/server/cache";
import type { PublicMenuData } from "@/components/menu/types";

const media = z.object({ sm: z.string(), lg: z.string(), w: z.number(), h: z.number() }).nullable();

const okSchema = z.object({
  status: z.enum(["ok", "unpublished"]),
  business: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    brand_color: z.string().nullable(),
    // Un diseño inválido (no debería existir: lo valida la base) se ignora y se usa el estándar.
    theme: z.unknown().optional().transform((value) => parseTheme(value)),
    currency: z.string(),
    locale: z.string(),
    logo: media,
    cover: media,
  }),
  branch: z.object({
    id: z.string(),
    name: z.string(),
    public_slug: z.string(),
    address: z.string(),
    phone: z.string(),
    whatsapp: z.string(),
    public_note: z.string(),
    timezone: z.string(),
    opening_hours: z.array(z.object({ day: z.number(), open: z.string(), close: z.string() })),
    other_branches: z.array(z.object({ name: z.string(), public_slug: z.string() })),
  }),
  menus: z.array(
    z.object({
      menu_id: z.string(),
      kind: z.string(),
      version_id: z.string(),
      version_number: z.number(),
      published_at: z.string(),
      snapshot: snapshotSchema,
    }),
  ),
  promotions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["daily_menu", "promotion"]),
        title: z.string(),
        description: z.string(),
        items: z.array(z.string()),
        price_minor: z.number().nullable(),
        starts_on: z.string(),
        ends_on: z.string(),
        weekdays: z.array(z.number()),
        start_time: z.string(),
        end_time: z.string(),
      }),
    )
    .default([]),
});

export type PublicMenuResult =
  | { status: "not_found" }
  | { status: "unavailable"; businessName: string; branchName: string }
  | { status: "unpublished"; data: PublicMenuData }
  | { status: "ok"; data: PublicMenuData };

/**
 * Carta pública de una sucursal. Solo lee versiones publicadas (a través de
 * get_public_menu con la clave pública), así que la caché nunca contiene
 * borradores. Se invalida al publicar con updateTag(public-menu:<slug>).
 */
export async function getPublicMenu(slug: string): Promise<PublicMenuResult> {
  "use cache";
  cacheTag(publicMenuTag(slug));
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_public_menu", { p_slug: slug });
  if (error) throw new Error("No se pudo cargar la carta pública");
  const raw = data as { status?: string; business?: { name?: string }; branch?: { name?: string } } | null;
  if (!raw || raw.status === "not_found") return { status: "not_found" };
  if (raw.status === "unavailable") {
    return { status: "unavailable", businessName: raw.business?.name ?? "", branchName: raw.branch?.name ?? "" };
  }
  const parsed = okSchema.parse(raw);
  const result: PublicMenuData = { business: parsed.business, branch: parsed.branch, menus: parsed.menus, promotions: parsed.promotions };
  return parsed.status === "ok" ? { status: "ok", data: result } : { status: "unpublished", data: result };
}
