"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { ImageValidationError, inspectImage } from "@/lib/images";
import { authedAction, fail, parseInput, rpc } from "@/server/action";
import { getAiAvailability } from "@/server/ai-availability";
import { createAdminClient } from "@/server/supabase/admin";

const uuid = z.string().uuid();
const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;

const prepareSchema = z.object({
  menuId: uuid,
  branchIds: z.array(uuid).min(1, "Elegí al menos una sucursal.").max(50),
  scope: z.enum(["full", "categories", "prices_only"]),
  categoryIds: z.array(uuid).max(100),
  files: z
    .array(z.object({ name: z.string().max(200), type: z.enum(ALLOWED), size: z.number().int().positive() }))
    .min(1, "Agregá al menos una foto.")
    .max(30),
  idempotencyKey: uuid,
});

/** Crea la importación y devuelve URLs firmadas para subir cada foto al bucket privado. */
export async function prepareImportAction(input: z.input<typeof prepareSchema>) {
  return authedAction(async ({ supabase }) => {
    const data = parseInput(prepareSchema, input);
    const env = serverEnv();
    if (data.files.some((f) => f.size > env.imports.maxImageBytes)) fail("file_too_large");
    const ai = await getAiAvailability();
    if (!ai.available) fail("ai_not_configured");

    const created = await rpc<{ import_id: string; status: string; replayed: boolean; images: { id: string; page_number: number; storage_path: string }[] }>(
      supabase,
      "create_import",
      {
        p_menu_id: data.menuId,
        p_branch_ids: data.branchIds,
        p_scope: data.scope,
        p_category_ids: data.categoryIds,
        p_files: data.files,
        p_idempotency_key: data.idempotencyKey,
      },
    );
    if (created.status !== "uploading") return { importId: created.import_id, submitted: true, uploads: [] };

    const admin = createAdminClient();
    const uploads = await Promise.all(
      created.images.map(async (image) => {
        const { data: signed, error } = await admin.storage.from("import-originals").createSignedUploadUrl(image.storage_path, { upsert: true });
        if (error || !signed) fail("upload_failed");
        return { imageId: image.id, pageNumber: image.page_number, path: image.storage_path, token: signed.token };
      }),
    );
    return { importId: created.import_id, submitted: false, uploads };
  });
}

const submitSchema = z.object({
  importId: uuid,
  pages: z.array(z.object({ imageId: uuid, rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) })).min(1).max(30),
});

/**
 * Valida en el servidor el contenido real de cada foto (formato, tamaño y
 * dimensiones), calcula su huella y envía la importación a la cola reservando
 * cuota de forma atómica.
 */
export async function submitImportAction(input: z.input<typeof submitSchema>) {
  return authedAction(async ({ supabase, user }) => {
    const data = parseInput(submitSchema, input);
    const env = serverEnv();
    const { data: imp } = await supabase.from("imports").select("id, status, created_by, business_id").eq("id", data.importId).maybeSingle();
    if (!imp) fail("not_found");
    if (imp.created_by !== user.id) fail("forbidden");
    if (imp.status !== "uploading") return { importId: imp.id, status: imp.status };

    const { data: images } = await supabase.from("import_images").select("id, storage_path").eq("import_id", imp.id);
    const byId = new Map((images ?? []).map((i) => [i.id, i.storage_path]));
    const admin = createAdminClient();
    const pages = [];
    for (const [index, page] of data.pages.entries()) {
      const path = byId.get(page.imageId);
      if (!path) fail("invalid_image");
      const { data: blob, error } = await admin.storage.from("import-originals").download(path);
      if (error || !blob) fail("upload_failed", `Foto ${index + 1}`);
      const buffer = Buffer.from(await blob.arrayBuffer());
      try {
        const info = await inspectImage(buffer, {
          maxBytes: env.imports.maxImageBytes,
          minSide: env.imports.minImageSide,
          maxSide: env.imports.maxImageSide,
        });
        pages.push({
          image_id: page.imageId,
          page_number: index + 1,
          rotation: page.rotation,
          sha256: createHash("sha256").update(buffer).digest("hex"),
          bytes: info.bytes,
          width: info.width,
          height: info.height,
          format: info.format,
        });
      } catch (validation) {
        if (validation instanceof ImageValidationError) fail(validation.code, `Foto ${index + 1}: ${validation.message}`);
        throw validation;
      }
    }

    const result = await rpc<{ import_id: string; status: string }>(admin, "server_submit_import", {
      p_actor_id: user.id,
      p_import_id: imp.id,
      p_pages: pages,
      p_max_attempts: env.imports.maxAttempts,
    });

    // Fotos que se quitaron antes de enviar: se borran del almacenamiento.
    const kept = new Set(data.pages.map((p) => p.imageId));
    const removed = (images ?? []).filter((i) => !kept.has(i.id)).map((i) => i.storage_path);
    if (removed.length) await admin.storage.from("import-originals").remove(removed);
    return { importId: result.import_id, status: result.status };
  });
}

export async function importStatusAction(importId: string) {
  return authedAction(async ({ supabase }) => {
    const { data } = await supabase
      .from("imports")
      .select("id, status, stage, stage_page, page_count, attempts, max_attempts, error_code, error_message, next_attempt_at, updated_at")
      .eq("id", parseInput(uuid, importId))
      .maybeSingle();
    if (!data) fail("not_found");
    const { data: processing } = await supabase.rpc("get_processing_status");
    return { ...data, workerOnline: Boolean((processing as { worker_online?: boolean } | null)?.worker_online) };
  });
}

export async function cancelImportAction(importId: string) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "cancel_import", { p_import_id: parseInput(uuid, importId) });
    refresh();
    return null;
  });
}

export async function retryImportAction(importId: string) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ requeued: boolean }>(supabase, "retry_import", { p_import_id: parseInput(uuid, importId) });
    refresh();
    return result;
  });
}

const correctionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    description: z.string().trim().max(600).nullable().optional(),
    price_minor: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
    resolution: z.enum(["same", "new"]).optional(),
    category_id: uuid.optional(),
    category_ref: z.string().max(140).optional(),
    variants: z
      .array(z.object({ variant_id: uuid.nullable().optional(), name: z.string().trim().min(1).max(60), price_minor: z.number().int().min(0).max(100_000_000_000).nullable() }))
      .max(20)
      .optional(),
  })
  .strict();

export async function decideProposalAction(proposalId: string, decision: "approve" | "reject" | "reset", correction?: z.input<typeof correctionSchema>) {
  return authedAction(async ({ supabase }) => {
    await rpc(supabase, "decide_proposal", {
      p_proposal_id: parseInput(uuid, proposalId),
      p_decision: parseInput(z.enum(["approve", "reject", "reset"]), decision),
      p_correction: correction ? parseInput(correctionSchema, correction) : null,
    });
    refresh();
    return null;
  });
}

export async function bulkDecideAction(importId: string, decision: "approve" | "reject", kinds?: string[]) {
  return authedAction(async ({ supabase }) => {
    const count = await rpc<number>(supabase, "bulk_decide_proposals", {
      p_import_id: parseInput(uuid, importId),
      p_decision: parseInput(z.enum(["approve", "reject"]), decision),
      p_kinds: kinds?.length ? parseInput(z.array(z.string().max(40)).max(20), kinds) : null,
    });
    refresh();
    return { count };
  });
}

export async function applyImportAction(importId: string) {
  return authedAction(async ({ supabase }) => {
    const result = await rpc<{ status: "applied" | "conflicts"; applied?: number; conflicts?: string[]; replayed?: boolean }>(supabase, "apply_import", {
      p_import_id: parseInput(uuid, importId),
    });
    refresh();
    return result;
  });
}
