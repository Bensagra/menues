import sharp from "sharp";

// Utilidades de imagen compartidas por el servidor web y el worker.

export interface ImageInfo {
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
  bytes: number;
}

export class ImageValidationError extends Error {
  constructor(
    readonly code: "invalid_file_type" | "image_unreadable" | "image_too_small" | "image_too_large" | "file_too_large",
    message: string,
  ) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export interface ImageLimits {
  maxBytes: number;
  minSide: number;
  maxSide: number;
}

/** Detecta el formato real por contenido (no por extensión ni tipo declarado) y valida tamaño. */
export async function inspectImage(buffer: Buffer, limits: ImageLimits): Promise<ImageInfo> {
  if (buffer.byteLength > limits.maxBytes) throw new ImageValidationError("file_too_large", "La foto es demasiado pesada.");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 150_000_000 }).metadata();
  } catch {
    throw new ImageValidationError("image_unreadable", "El archivo no es una imagen válida.");
  }
  const format = metadata.format;
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new ImageValidationError("invalid_file_type", "Usá fotos en formato JPG, PNG o WebP.");
  }
  // Con orientación EXIF 5-8 el ancho y el alto visibles están invertidos.
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = (rotated ? metadata.height : metadata.width) ?? 0;
  const height = (rotated ? metadata.width : metadata.height) ?? 0;
  if (Math.min(width, height) < limits.minSide) {
    throw new ImageValidationError("image_too_small", `La foto es muy chica (mínimo ${limits.minSide} px por lado). Probá con una foto más nítida.`);
  }
  if (Math.max(width, height) > limits.maxSide) {
    throw new ImageValidationError("image_too_large", `La foto es demasiado grande (máximo ${limits.maxSide} px por lado).`);
  }
  return { format, width, height, bytes: buffer.byteLength };
}

/**
 * Prepara la imagen para el modelo: respeta la orientación EXIF, aplica la
 * rotación elegida por el usuario, limita el tamaño y la convierte a JPEG
 * (formato aceptado por xAI) sin metadatos.
 */
export async function prepareForModel(buffer: Buffer, rotation: number, maxSide = 2048): Promise<Buffer> {
  return sharp(buffer, { limitInputPixels: 150_000_000 })
    .rotate()
    .rotate(rotation % 360)
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
