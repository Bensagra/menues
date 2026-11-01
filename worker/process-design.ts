import { createHash } from "node:crypto";
import sharp from "sharp";
import type { DesignImage, MenuExtractionProvider } from "@/ai/types";
import { ProviderError } from "@/ai/types";
import type { DesignSource } from "@/domain/design-proposal";
import { prepareForModel } from "@/lib/images";
import type { AppSupabaseClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import { log } from "./log";
import { isSocialUrl, readWebsite, WebsiteError, type WebsiteSignals } from "./website";

type DesignRow = Database["public"]["Tables"]["design_requests"]["Row"];

export interface DesignDeps {
  db: AppSupabaseClient;
  provider: MenuExtractionProvider;
  signal: AbortSignal;
  /** Reemplazable en pruebas (por defecto lee el sitio real). */
  readWebsite?: typeof readWebsite;
}

const USER_MESSAGES: Record<string, string> = {
  timeout: "El servicio de IA tardó demasiado en responder.",
  rate_limited: "El servicio de IA está saturado en este momento.",
  quota_exhausted: "Se agotó el cupo gratuito de hoy del servicio de IA. Se renueva todos los días: probá de nuevo mañana o ajustá el diseño a mano.",
  unavailable: "El servicio de IA no está disponible por el momento.",
  network: "No pudimos conectarnos con el servicio de IA.",
  invalid_output: "No pudimos interpretar la propuesta del servicio de IA.",
  incomplete: "La propuesta quedó incompleta.",
  auth: "La clave del servicio de IA no es válida. Avisale al administrador de la plataforma.",
  bad_request: "El servicio de IA rechazó el pedido.",
  refused: "El servicio de IA no pudo procesar las imágenes del local.",
  not_configured: "El diseño con IA necesita configuración.",
  internal: "Ocurrió un error inesperado al armar la propuesta.",
};

/** Imagen lista para el modelo: JPEG sin metadatos, hasta 1280 px; null si no es una imagen válida. */
async function toModelImage(buffer: Buffer, rotation = 0): Promise<Buffer | null> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: 150_000_000 }).metadata();
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) return null;
    // Los logos con transparencia se apoyan sobre blanco para que el color se vea como en papel.
    const flattened = meta.hasAlpha ? await sharp(buffer).flatten({ background: "#ffffff" }).toBuffer() : buffer;
    return await prepareForModel(flattened, rotation, 1280);
  } catch {
    return null;
  }
}

async function download(db: AppSupabaseClient, bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export function designContext(input: {
  name: string;
  description: string;
  categories: string[];
  products: string[];
  website: WebsiteSignals | null;
  websiteNote: string | null;
}): string {
  const lines = [`Restaurant name: ${input.name}`];
  if (input.description) lines.push(`Description written by the owner: ${input.description}`);
  if (input.categories.length) lines.push(`Menu sections: ${input.categories.join(", ")}`);
  if (input.products.length) lines.push(`Some dishes: ${input.products.join(", ")}`);
  if (input.website) {
    const w = input.website;
    lines.push(`Website: ${w.url}`);
    if (w.title) lines.push(`  Title: ${w.title}`);
    if (w.siteName) lines.push(`  Site name: ${w.siteName}`);
    if (w.description) lines.push(`  Description: ${w.description}`);
    if (w.themeColor) lines.push(`  Theme color: ${w.themeColor}`);
    if (w.colors.length) lines.push(`  Colors used in its styles (most used first): ${w.colors.join(", ")}`);
    if (w.fonts.length) lines.push(`  Fonts used: ${w.fonts.join(", ")}`);
  }
  if (input.websiteNote) lines.push(input.websiteNote);
  return lines.join("\n");
}

export async function processDesign(job: DesignRow, deps: DesignDeps): Promise<void> {
  const { db, provider } = deps;
  const lockToken = job.lock_token!;
  const fields = { designId: job.id, attempt: job.attempts };
  const started = Date.now();

  try {
    const { data: business, error } = await db
      .from("businesses")
      .select("id, name, description, logo:media!businesses_logo_fk(path_lg), cover:media!businesses_cover_fk(path_lg)")
      .eq("id", job.business_id)
      .single();
    if (error || !business) throw new Error(`businesses: ${error?.message ?? "no encontrado"}`);

    const [{ data: categories }, { data: products }] = await Promise.all([
      db.from("categories").select("name").eq("business_id", job.business_id).order("sort_order").limit(25),
      db.from("products").select("name").eq("business_id", job.business_id).is("archived_at", null).order("sort_order").limit(30),
    ]);

    const images: DesignImage[] = [];
    const sources: DesignSource[] = [];
    const addImage = async (source: DesignSource, label: string, buffer: Buffer | null, rotation = 0) => {
      const prepared = buffer ? await toModelImage(buffer, rotation) : null;
      if (!prepared) return;
      images.push({ label, image: prepared, mimeType: "image/jpeg" });
      sources.push(source);
    };

    const logoPath = (business.logo as unknown as { path_lg: string } | null)?.path_lg;
    const coverPath = (business.cover as unknown as { path_lg: string } | null)?.path_lg;
    if (logoPath) await addImage("logo", "the restaurant's logo", await download(db, "public-media", logoPath));
    if (coverPath) await addImage("cover", "a photo of the restaurant (cover photo chosen by the owner)", await download(db, "public-media", coverPath));

    if (job.import_id) {
      const { data: page } = await db
        .from("import_images")
        .select("storage_path, rotation")
        .eq("import_id", job.import_id)
        .eq("business_id", job.business_id)
        .in("status", ["ready", "extracted"])
        .order("page_number")
        .limit(1)
        .maybeSingle();
      if (page) await addImage("menu_photo", "a photo of the restaurant's printed menu", await download(db, "import-originals", page.storage_path), page.rotation);
    }

    let website: WebsiteSignals | null = null;
    let websiteNote: string | null = null;
    if (job.website_url) {
      if (isSocialUrl(job.website_url)) {
        websiteNote = `Social profile (could not be read): ${job.website_url}`;
      } else {
        try {
          const result = await (deps.readWebsite ?? readWebsite)(job.website_url, deps.signal);
          website = result.signals;
          sources.push("website");
          await addImage("website", "the main image of the restaurant's website", result.image);
        } catch (error) {
          websiteNote = "The website could not be read.";
          log.warn("no se pudo leer el sitio web", { ...fields, code: error instanceof WebsiteError ? error.code : "error" });
        }
      }
    }

    const context = designContext({
      name: business.name,
      description: business.description,
      categories: (categories ?? []).map((c) => c.name),
      products: (products ?? []).map((p) => p.name),
      website,
      websiteNote,
    });

    const result = await provider.designTheme({
      images,
      context,
      safetyIdentifier: createHash("sha256").update(`cartalista:${job.business_id}`).digest("hex").slice(0, 32),
      signal: deps.signal,
    });

    const { error: completeError } = await db.rpc("worker_complete_design", {
      p_request_id: job.id,
      p_lock_token: lockToken,
      p_theme: result.data.theme as never,
      p_summary: result.data.summary,
      p_sources: [...new Set(sources)],
      p_provider: provider.name,
      p_model: result.model,
    });
    if (completeError) throw new Error(`worker_complete_design: ${completeError.message}`);
    log.info("propuesta de diseño lista", { ...fields, sources: [...new Set(sources)], images: images.length, ms: Date.now() - started });
  } catch (error) {
    if (deps.signal.aborted) return;
    const providerError = error instanceof ProviderError ? error : null;
    const code = providerError?.code ?? "internal";
    if (providerError) log.warn("error del proveedor (diseño)", { ...fields, code, detail: providerError.message });
    else log.error("error inesperado (diseño)", { ...fields, detail: error instanceof Error ? error.message : String(error) });
    const { error: failError } = await db.rpc("worker_fail_design", {
      p_request_id: job.id,
      p_lock_token: lockToken,
      p_error_code: code,
      p_error_message: USER_MESSAGES[code] ?? USER_MESSAGES.internal,
      p_retryable: providerError ? providerError.retryable : true,
      p_retry_after_seconds: providerError?.retryAfterSeconds ?? undefined,
    });
    if (failError && failError.message !== "lease_lost") log.error("no se pudo registrar el error (diseño)", { ...fields, detail: failError.message });
  }
}
