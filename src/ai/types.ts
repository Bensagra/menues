import type { DesignProposal } from "@/domain/design-proposal";
import type { PageExtraction } from "@/domain/extraction";

// Interfaz del proveedor de extracción (Grok, Gemini o el simulado). Permite sumar otro
// proveedor sin tocar el worker ni el motor de comparación.

export interface ExtractionUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd_ticks: number;
}

export interface ExtractPageInput {
  image: Buffer;
  mimeType: "image/jpeg" | "image/png";
  pageNumber: number;
  pageCount: number;
  /** Identificador estable y no personal del negocio (para atribución de abuso en el proveedor). */
  safetyIdentifier: string;
  /** Clave para agrupar las páginas de una misma importación (caché de prompt). */
  cacheKey: string;
  /** SHA-256 del archivo original subido (para trazabilidad y para el proveedor de pruebas). */
  sourceSha256?: string;
  signal: AbortSignal;
}

export interface ExtractPageResult {
  data: PageExtraction;
  usage: ExtractionUsage;
  model: string;
}

export interface DesignImage {
  /** Qué es la imagen (por ejemplo "logo"), para que el modelo sepa cómo usarla. */
  label: string;
  image: Buffer;
  mimeType: "image/jpeg" | "image/png";
}

export interface DesignThemeInput {
  images: DesignImage[];
  /** Datos del local (nombre, secciones, platos, sitio web). Texto no confiable. */
  context: string;
  safetyIdentifier: string;
  signal: AbortSignal;
}

export interface DesignThemeResult {
  data: DesignProposal;
  usage: ExtractionUsage;
  model: string;
}

export interface MenuExtractionProvider {
  readonly name: "xai" | "gemini" | "mock";
  readonly model: string;
  /** true solo para el proveedor de pruebas: sus resultados nunca se presentan como reales. */
  readonly simulated: boolean;
  extractPage(input: ExtractPageInput): Promise<ExtractPageResult>;
  /** Propone el diseño de la carta a partir de las referencias del local. */
  designTheme(input: DesignThemeInput): Promise<DesignThemeResult>;
}

export type ProviderErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "quota_exhausted"
  | "unavailable"
  | "auth"
  | "bad_request"
  | "invalid_output"
  | "incomplete"
  | "refused"
  | "network";

/** Segundos de espera a partir de un Retry-After (segundos o fecha HTTP), entre 1 y 900. */
export function retryAfterSeconds(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.min(900, Math.round(seconds)));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.min(900, Math.round((date - Date.now()) / 1000))) : undefined;
}

const RETRYABLE: ProviderErrorCode[] = ["timeout", "rate_limited", "unavailable", "invalid_output", "incomplete", "network"];

/** Error del proveedor sin datos sensibles (nunca incluye la clave ni la imagen). */
export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryable = RETRYABLE.includes(code);
  }
}
