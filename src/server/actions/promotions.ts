"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { MAX_MINOR } from "@/domain/money";
import { authedAction, parseInput, rpc } from "@/server/action";
import { invalidatePublicMenus } from "@/server/cache";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Elegí una hora.");

const promotionSchema = z
  .object({
    id: uuid.nullable(),
    businessId: uuid,
    kind: z.enum(["daily_menu", "promotion"]),
    title: z.string().trim().min(2, "Escribí un título.").max(80, "Máximo 80 caracteres."),
    description: z.string().trim().max(400, "Máximo 400 caracteres.").default(""),
    items: z.array(z.string().trim().min(1).max(120, "Cada ítem puede tener hasta 120 caracteres.")).max(12, "Hasta 12 ítems."),
    priceMinor: z.number().int().min(0).max(MAX_MINOR).nullable(),
    startsOn: day,
    endsOn: day,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Elegí al menos un día.").max(7),
    startTime: time,
    endTime: time,
    branchIds: z.array(uuid).min(1, "Elegí al menos una sucursal.").max(50),
    expectedRevision: z.number().int().positive().optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "La fecha de fin tiene que ser igual o posterior a la de inicio." })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "La hora de fin tiene que ser posterior a la de inicio." });

export type PromotionInput = z.input<typeof promotionSchema>;

export async function savePromotionAction(input: PromotionInput) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(promotionSchema, { ...input, items: (input.items ?? []).filter((i) => i.trim()) });
    const result = await rpc<{ id: string; overlaps: { id: string; title: string }[]; branch_slugs: string[] }>(supabase, "save_promotion", {
      p_payload: {
        id: data.id,
        business_id: data.businessId,
        kind: data.kind,
        title: data.title,
        description: data.description,
        items: data.items,
        price_minor: data.priceMinor,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        weekdays: data.weekdays,
        start_time: data.startTime,
        end_time: data.endTime,
        branch_ids: data.branchIds,
        ...(data.expectedRevision ? { expected_revision: data.expectedRevision } : {}),
      },
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return { id: result.id, overlaps: result.overlaps };
  });
}

export async function setPromotionPausedAction(promotionId: string, paused: boolean) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ branch_slugs: string[] }>(supabase, "set_promotion_paused", {
      p_promotion_id: parseInput(uuid, promotionId),
      p_paused: Boolean(paused),
    });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return null;
  });
}

export async function deletePromotionAction(promotionId: string) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ branch_slugs: string[] }>(supabase, "delete_promotion", { p_promotion_id: parseInput(uuid, promotionId) });
    invalidatePublicMenus(result.branch_slugs);
    refresh();
    return null;
  });
}
