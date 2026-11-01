import "server-only";
import { aiStatus } from "@/lib/env";
import { createClient } from "@/server/supabase/server";

export interface AiAvailability {
  /** Se pueden crear importaciones con fotos. */
  available: boolean;
  /** El worker está enviando latidos. */
  workerOnline: boolean;
  /** Proveedor simulado: solo pruebas o desarrollo explícito. */
  simulated: boolean;
  reason: "ok" | "not_configured" | "worker_offline";
}

/**
 * La clave del proveedor de IA (Grok o Gemini) puede estar solo en el worker (recomendado) o también en el
 * servidor web. Se considera configurado si cualquiera de los dos lo informa.
 */
export async function getAiAvailability(): Promise<AiAvailability> {
  const local = aiStatus();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_processing_status");
  const status = (data ?? {}) as { worker_online?: boolean; ai_configured?: boolean; provider?: string | null };
  const workerOnline = Boolean(status.worker_online);
  const workerConfigured = workerOnline && Boolean(status.ai_configured);
  const configured = local.configured || workerConfigured;
  const simulated = (local.configured && local.simulated) || (workerConfigured && status.provider === "mock");
  if (!configured) return { available: false, workerOnline, simulated: false, reason: "not_configured" };
  return { available: true, workerOnline, simulated, reason: workerOnline ? "ok" : "worker_offline" };
}
