import { createHash } from "node:crypto";
import type { MenuExtractionProvider } from "@/ai/types";
import { ProviderError } from "@/ai/types";
import { buildProposals } from "@/domain/diff";
import { mergePageExtractions, parsePageExtraction, type PageExtraction } from "@/domain/extraction";
import { ImageValidationError, inspectImage, prepareForModel, type ImageLimits } from "@/lib/images";
import type { AppSupabaseClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import { loadCatalogForImport } from "./catalog";
import { log } from "./log";

type ImportRow = Database["public"]["Tables"]["imports"]["Row"];

export interface ProcessDeps {
  db: AppSupabaseClient;
  provider: MenuExtractionProvider;
  leaseSeconds: number;
  limits: ImageLimits;
  signal: AbortSignal;
}

/** El trabajo fue cancelado o el lease pasó a otro worker: se abandona sin escribir. */
class StopProcessing extends Error {}

/** Error definitivo (no tiene sentido reintentar). */
class PermanentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const USER_MESSAGES: Record<string, string> = {
  timeout: "El servicio de lectura tardó demasiado en responder.",
  rate_limited: "El servicio de lectura está saturado en este momento.",
  quota_exhausted: "Se agotó el cupo gratuito de hoy del servicio de IA. Se renueva todos los días: probá de nuevo mañana o cargá los cambios a mano.",
  unavailable: "El servicio de lectura no está disponible por el momento.",
  network: "No pudimos conectarnos con el servicio de lectura.",
  invalid_output: "No pudimos interpretar la respuesta del servicio de lectura.",
  incomplete: "La lectura de la foto quedó incompleta.",
  auth: "La clave del servicio de IA no es válida. Avisale al administrador de la plataforma.",
  bad_request: "El servicio de IA rechazó la imagen. Probá con otra foto.",
  refused: "El servicio de lectura no pudo procesar esta imagen. Probá con otra foto.",
  not_configured: "El procesamiento con IA necesita configuración.",
  image_unreadable: "La imagen no se pudo leer. Probá con una foto más nítida.",
  invalid_file_type: "Alguna foto no es una imagen válida (JPG, PNG o WebP).",
  image_too_small: "Alguna foto es demasiado chica. Probá con una foto más nítida.",
  image_too_large: "Alguna foto es demasiado grande. Probá con otra foto.",
  file_too_large: "Alguna foto es demasiado pesada. Probá con otra foto.",
  missing_image: "No encontramos alguna de las fotos subidas. Volvé a crear la importación.",
  internal: "Ocurrió un error inesperado al procesar las fotos.",
};

export async function processImport(job: ImportRow, deps: ProcessDeps): Promise<void> {
  const { db, provider } = deps;
  const lockToken = job.lock_token!;
  const started = Date.now();
  const fields = { importId: job.id, attempt: job.attempts };

  const progress = async (stage: "preparing" | "reading" | "comparing", page?: number) => {
    if (deps.signal.aborted) throw new StopProcessing();
    const { data, error } = await db.rpc("worker_progress", {
      p_import_id: job.id,
      p_lock_token: lockToken,
      p_stage: stage,
      p_stage_page: page ?? undefined,
      p_lease_seconds: deps.leaseSeconds,
    });
    if (error) throw new Error(`worker_progress: ${error.message}`);
    if (data === "stop") throw new StopProcessing();
  };

  try {
    await progress("preparing");
    const { data: images, error: imagesError } = await db
      .from("import_images")
      .select("id, page_number, storage_path, rotation, status, extraction, sha256")
      .eq("import_id", job.id)
      .eq("business_id", job.business_id)
      .order("page_number");
    if (imagesError) throw new Error(`import_images: ${imagesError.message}`);
    if (!images?.length) throw new PermanentError("missing_image", USER_MESSAGES.missing_image);

    const safetyIdentifier = createHash("sha256").update(`cartalista:${job.business_id}`).digest("hex").slice(0, 32);
    const extracted = new Map<number, PageExtraction>();

    for (const image of images) {
      if (image.status === "extracted" && image.extraction) {
        const previous = parsePageExtraction(image.extraction);
        if (previous.ok) {
          extracted.set(image.page_number, previous.data);
          continue;
        }
      }
      await progress("reading", image.page_number);
      const { data: blob, error: downloadError } = await db.storage.from("import-originals").download(image.storage_path);
      if (downloadError || !blob) throw new PermanentError("missing_image", USER_MESSAGES.missing_image);
      const original = Buffer.from(await blob.arrayBuffer());
      try {
        await inspectImage(original, deps.limits);
      } catch (error) {
        if (error instanceof ImageValidationError) {
          await db.rpc("worker_mark_page_failed", { p_import_id: job.id, p_lock_token: lockToken, p_image_id: image.id, p_error_code: error.code });
          throw new PermanentError(error.code, `Foto ${image.page_number}: ${USER_MESSAGES[error.code] ?? error.message}`);
        }
        throw error;
      }
      const prepared = await prepareForModel(original, image.rotation);
      const result = await provider.extractPage({
        image: prepared,
        mimeType: "image/jpeg",
        pageNumber: image.page_number,
        pageCount: images.length,
        safetyIdentifier,
        cacheKey: `cartalista-import-${job.id}`,
        sourceSha256: image.sha256 ?? undefined,
        signal: deps.signal,
      });
      const { error: saveError } = await db.rpc("worker_save_page", {
        p_import_id: job.id,
        p_lock_token: lockToken,
        p_image_id: image.id,
        p_extraction: result.data as never,
        p_usage: result.usage as never,
        p_provider: provider.name,
        p_model: result.model,
      });
      if (saveError) {
        if (saveError.message === "lease_lost") throw new StopProcessing();
        throw new Error(`worker_save_page: ${saveError.message}`);
      }
      extracted.set(image.page_number, result.data);
      log.info("página leída", { ...fields, page: image.page_number, provider: provider.name, model: result.model });
    }

    await progress("comparing");
    const merged = mergePageExtractions([...extracted.entries()].map(([page, data]) => ({ page, data })));
    if (merged.pages.every((p) => !p.readable)) {
      throw new PermanentError("image_unreadable", USER_MESSAGES.image_unreadable);
    }

    const catalog = await loadCatalogForImport(db, {
      businessId: job.business_id,
      menuId: job.menu_id,
      importId: job.id,
      createdBy: job.created_by,
      scope: job.scope as "full" | "categories" | "prices_only",
    });
    const { proposals, summary } = buildProposals({
      extraction: merged,
      catalog: { categories: catalog.categories, products: catalog.products },
      scope: job.scope as "full" | "categories" | "prices_only",
      scopeCategoryIds: catalog.scopeCategoryIds,
      currency: catalog.currency,
      baseScope: catalog.baseScope,
      coversMenu: catalog.coversMenu,
    });

    const { error: completeError } = await db.rpc("worker_complete_import", {
      p_import_id: job.id,
      p_lock_token: lockToken,
      p_extraction: merged as never,
      p_proposals: proposals as never,
      p_summary: summary as never,
      p_base_state: {
        products: catalog.products.length,
        revisions: Object.fromEntries(catalog.products.map((p) => [p.id, p.revision])),
        base_scope: catalog.baseScope,
      } as never,
    });
    if (completeError) {
      if (completeError.message === "lease_lost") throw new StopProcessing();
      throw new Error(`worker_complete_import: ${completeError.message}`);
    }
    log.info("importación lista para revisar", { ...fields, proposals: proposals.length, ms: Date.now() - started });
    // Con la primera foto de la carta se propone un diseño a medida (una sola vez por local).
    const { data: designId, error: designError } = await db.rpc("worker_request_design_from_import", { p_import_id: job.id });
    if (designError) log.warn("no se pudo pedir la propuesta de diseño", { ...fields, detail: designError.message });
    else if (designId) log.info("propuesta de diseño pedida", { ...fields, designId });
  } catch (error) {
    if (error instanceof StopProcessing) {
      log.info("importación abandonada (cancelada o lease perdido)", fields);
      return;
    }
    let code = "internal";
    let message = USER_MESSAGES.internal;
    let retryable = true;
    let retryAfter: number | undefined;
    if (error instanceof ProviderError) {
      code = error.code;
      message = USER_MESSAGES[error.code] ?? USER_MESSAGES.internal;
      retryable = error.retryable;
      retryAfter = error.retryAfterSeconds;
      log.warn("error del proveedor", { ...fields, code: error.code, status: error.status, detail: error.message });
    } else if (error instanceof PermanentError) {
      code = error.code;
      message = error.message;
      retryable = false;
      log.warn("error definitivo", { ...fields, code });
    } else {
      log.error("error inesperado", { ...fields, detail: error instanceof Error ? error.message : String(error) });
    }
    const { error: failError } = await db.rpc("worker_fail_import", {
      p_import_id: job.id,
      p_lock_token: lockToken,
      p_error_code: code,
      p_error_message: message,
      p_retryable: retryable,
      p_retry_after_seconds: retryAfter ?? undefined,
    });
    if (failError && failError.message !== "lease_lost") {
      log.error("no se pudo registrar el error", { ...fields, detail: failError.message });
    }
  }
}
