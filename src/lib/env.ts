import { z } from "zod";

// Configuración validada. Las variables NEXT_PUBLIC_* son públicas; el resto
// solo existe en el servidor (Next.js no las incluye en el bundle del
// navegador) y en el worker.

const publicSchema = z.object({
  appUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(20),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let publicEnvCache: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (publicEnvCache) return publicEnvCache;
  const parsed = publicSchema.safeParse({
    appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Faltan variables de entorno públicas: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver .env.example).",
    );
  }
  publicEnvCache = parsed.data;
  return publicEnvCache;
}

const int = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).catch(fallback).default(fallback);

const serverSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).catch("development"),
  supabaseSecretKey: z.string().min(20).optional(),
  ai: z.object({
    provider: z.enum(["xai", "gemini", "mock"]).catch("xai"),
    allowMock: z.boolean(),
    xaiApiKey: z.string().min(1).optional(),
    xaiModel: z.string().min(1),
    xaiBaseUrl: z.string().url(),
    xaiReasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
    xaiTimeoutMs: int(180_000, 10_000, 900_000),
    xaiMaxOutputTokens: int(16_000, 1_000, 128_000),
    geminiApiKey: z.string().min(1).optional(),
    geminiModel: z.string().min(1),
    geminiFallbackModels: z.array(z.string().min(1)).max(5),
    geminiBaseUrl: z.string().url(),
    geminiThinkingLevel: z.enum(["minimal", "low", "medium", "high"]).optional(),
    geminiTimeoutMs: int(300_000, 10_000, 900_000),
    geminiMaxOutputTokens: int(32_000, 1_000, 65_536),
  }),
  imports: z.object({
    maxImageBytes: z.number().int(),
    minImageSide: int(600, 100, 4000),
    maxImageSide: int(12_000, 1000, 20_000),
    maxAttempts: int(3, 1, 10),
  }),
  worker: z.object({
    concurrency: int(2, 1, 10),
    pollIntervalMs: int(3000, 500, 60_000),
    leaseSeconds: int(300, 60, 3600),
    /** Minutos tras los que se cancela una importación que nunca terminó de subir sus fotos. */
    uploadTtlMinutes: int(1440, 30, 10_080),
  }),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let serverEnvCache: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() solo puede usarse en el servidor");
  if (serverEnvCache) return serverEnvCache;
  const e = process.env;
  const maxImageMb = Math.min(Math.max(Number(e.IMPORT_MAX_IMAGE_MB ?? 12) || 12, 1), 20);
  serverEnvCache = serverSchema.parse({
    nodeEnv: e.NODE_ENV,
    supabaseSecretKey: e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY || undefined,
    ai: {
      provider: (e.AI_PROVIDER || "xai").toLowerCase(),
      allowMock: e.ALLOW_MOCK_AI === "true",
      xaiApiKey: e.XAI_API_KEY || undefined,
      xaiModel: e.XAI_MODEL || "grok-4.7",
      xaiBaseUrl: (e.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, ""),
      xaiReasoningEffort: e.XAI_REASONING_EFFORT || undefined,
      xaiTimeoutMs: e.XAI_TIMEOUT_MS,
      xaiMaxOutputTokens: e.XAI_MAX_OUTPUT_TOKENS,
      geminiApiKey: e.GEMINI_API_KEY || undefined,
      geminiModel: e.GEMINI_MODEL || "gemini-3.5-flash",
      // Cada modelo tiene su propio cupo diario gratuito: si se agota el del principal, se usa el siguiente.
      geminiFallbackModels: (e.GEMINI_FALLBACK_MODELS ?? "gemini-3.8-flash")
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m && m !== (e.GEMINI_MODEL || "gemini-3.5-flash")),
      geminiBaseUrl: (e.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
      geminiThinkingLevel: e.GEMINI_THINKING_LEVEL || undefined,
      geminiTimeoutMs: e.GEMINI_TIMEOUT_MS,
      geminiMaxOutputTokens: e.GEMINI_MAX_OUTPUT_TOKENS,
    },
    imports: {
      maxImageBytes: Math.round(maxImageMb * 1024 * 1024),
      minImageSide: e.IMPORT_MIN_IMAGE_SIDE_PX,
      maxImageSide: e.IMPORT_MAX_IMAGE_SIDE_PX,
      maxAttempts: e.IMPORT_MAX_ATTEMPTS,
    },
    worker: {
      concurrency: e.WORKER_CONCURRENCY,
      pollIntervalMs: e.WORKER_POLL_INTERVAL_MS,
      leaseSeconds: e.WORKER_LEASE_SECONDS,
      uploadTtlMinutes: e.IMPORT_UPLOAD_TTL_MINUTES,
    },
  });
  return serverEnvCache;
}

export type AiStatus =
  | { configured: true; provider: "xai" | "gemini"; model: string; simulated: false }
  | { configured: true; provider: "mock"; model: "mock"; simulated: true }
  | { configured: false; provider: "xai" | "gemini" | "mock"; reason: "missing_api_key" | "mock_not_allowed" };

/**
 * El proveedor simulado solo se permite en pruebas o en desarrollo con
 * ALLOW_MOCK_AI=true. Nunca en producción.
 */
export function aiStatus(env: ServerEnv = serverEnv()): AiStatus {
  if (env.ai.provider === "mock") {
    const allowed = env.nodeEnv === "test" || (env.ai.allowMock && env.nodeEnv !== "production");
    return allowed
      ? { configured: true, provider: "mock", model: "mock", simulated: true }
      : { configured: false, provider: "mock", reason: "mock_not_allowed" };
  }
  if (env.ai.provider === "gemini") {
    return env.ai.geminiApiKey
      ? { configured: true, provider: "gemini", model: env.ai.geminiModel, simulated: false }
      : { configured: false, provider: "gemini", reason: "missing_api_key" };
  }
  if (!env.ai.xaiApiKey) return { configured: false, provider: "xai", reason: "missing_api_key" };
  return { configured: true, provider: "xai", model: env.ai.xaiModel, simulated: false };
}

export function requireSecretKey(env: ServerEnv = serverEnv()): string {
  if (!env.supabaseSecretKey) {
    throw new Error("Falta SUPABASE_SECRET_KEY (clave secreta de Supabase, solo servidor).");
  }
  return env.supabaseSecretKey;
}
