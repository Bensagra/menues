import { aiStatus, serverEnv, type ServerEnv } from "@/lib/env";
import { GeminiMenuExtractionProvider } from "./gemini";
import { MockMenuExtractionProvider } from "./mock";
import type { MenuExtractionProvider } from "./types";
import { XaiMenuExtractionProvider } from "./xai";

export type { MenuExtractionProvider } from "./types";
export { ProviderError } from "./types";

/**
 * Proveedor configurado o null si falta configuración. Nunca devuelve el
 * simulado fuera de pruebas o de un desarrollo con ALLOW_MOCK_AI=true.
 */
export function createExtractionProvider(env: ServerEnv = serverEnv()): MenuExtractionProvider | null {
  if (typeof window !== "undefined") throw new Error("El proveedor de IA solo existe en el servidor");
  const status = aiStatus(env);
  if (!status.configured) return null;
  if (status.provider === "mock") return new MockMenuExtractionProvider();
  if (status.provider === "gemini") {
    return new GeminiMenuExtractionProvider({
      apiKey: env.ai.geminiApiKey!,
      model: env.ai.geminiModel,
      baseUrl: env.ai.geminiBaseUrl,
      timeoutMs: env.ai.geminiTimeoutMs,
      maxOutputTokens: env.ai.geminiMaxOutputTokens,
      thinkingLevel: env.ai.geminiThinkingLevel,
    });
  }
  return new XaiMenuExtractionProvider({
    apiKey: env.ai.xaiApiKey!,
    model: env.ai.xaiModel,
    baseUrl: env.ai.xaiBaseUrl,
    timeoutMs: env.ai.xaiTimeoutMs,
    maxOutputTokens: env.ai.xaiMaxOutputTokens,
    reasoningEffort: env.ai.xaiReasoningEffort,
  });
}
