import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/server/supabase/admin";
import { fail } from "@/server/action";

export type MediaKind = "product_image" | "logo" | "cover";

const VARIANTS: Record<MediaKind, { sm: number; lg: number }> = {
  product_image: { sm: 480, lg: 1200 },
  logo: { sm: 160, lg: 512 },
  cover: { sm: 800, lg: 1600 },
};

export const UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** URL firmada para subir directamente al bucket privado de staging. */
export async function createStagingUpload(businessId: string, contentType: string, size: number) {
  if (!ALLOWED_TYPES.includes(contentType)) fail("invalid_file_type");
  if (size <= 0 || size > UPLOAD_MAX_BYTES) fail("file_too_large");
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${businessId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("uploads").createSignedUploadUrl(path);
  if (error || !data) fail("upload_failed");
  return { path, token: data.token };
}

/**
 * Valida el formato real de la imagen (no la extensión ni el tipo declarado),
 * la reencoda a WebP sin metadatos (EXIF/GPS) y la publica con rutas no
 * adivinables. Devuelve el id del medio creado.
 */
export async function processStagedImage(params: { actorId: string; businessId: string; stagingPath: string; kind: MediaKind }) {
  const { actorId, businessId, stagingPath, kind } = params;
  if (!stagingPath.startsWith(`${businessId}/`) || stagingPath.includes("..")) fail("invalid_path");
  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("uploads").download(stagingPath);
  if (error || !blob) fail("upload_failed");
  const input = Buffer.from(await blob.arrayBuffer());
  try {
    if (input.byteLength > UPLOAD_MAX_BYTES) fail("file_too_large");
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
    } catch {
      fail("image_unreadable");
    }
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) fail("invalid_file_type");
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 120) fail("image_unreadable");

    const sizes = VARIANTS[kind];
    const id = randomUUID();
    const render = (size: number) =>
      sharp(input, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
        .webp({ quality: kind === "logo" ? 90 : 80 })
        .toBuffer({ resolveWithObject: true });
    const [lg, sm] = await Promise.all([render(sizes.lg), render(sizes.sm)]);
    const folder = kind === "product_image" ? "products" : "brand";
    const pathLg = `${businessId}/${folder}/${id}-${sizes.lg}.webp`;
    const pathSm = `${businessId}/${folder}/${id}-${sizes.sm}.webp`;
    const options = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
    const [a, b] = await Promise.all([
      admin.storage.from("public-media").upload(pathLg, lg.data, options),
      admin.storage.from("public-media").upload(pathSm, sm.data, options),
    ]);
    if (a.error || b.error) fail("upload_failed");

    const { data: mediaId, error: rpcError } = await admin.rpc("server_create_media", {
      p_actor_id: actorId,
      p_business_id: businessId,
      p_kind: kind,
      p_path_sm: pathSm,
      p_path_lg: pathLg,
      p_width: lg.info.width,
      p_height: lg.info.height,
      p_bytes: lg.data.byteLength,
    });
    if (rpcError || !mediaId) {
      await admin.storage.from("public-media").remove([pathLg, pathSm]);
      fail(rpcError?.message && /^[a-z_]+$/.test(rpcError.message) ? rpcError.message : "upload_failed");
    }
    return { mediaId: mediaId as string, pathSm, pathLg, width: lg.info.width, height: lg.info.height };
  } finally {
    await admin.storage.from("uploads").remove([stagingPath]);
  }
}
