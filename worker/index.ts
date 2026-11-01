import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { createExtractionProvider } from "@/ai";
import { aiStatus, serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";
import { log } from "./log";
import { processImport } from "./process-import";

// Worker de importaciones. Proceso Node de larga duración (o --once para
// ejecutarlo desde un cron). Toma trabajos de la tabla imports con lease y
// token, así que se pueden correr varias instancias sin duplicar trabajo.

type ImportRow = Database["public"]["Tables"]["imports"]["Row"];

const VERSION = "1.0.0";
const once = process.argv.includes("--once");

async function main() {
  const env = serverEnv();
  const status = aiStatus(env);
  const provider = createExtractionProvider(env);
  const db = createServiceClient();
  const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const active = new Set<Promise<void>>();
  let stopping = false;

  log.info("worker iniciado", {
    workerId,
    provider: status.provider,
    configured: status.configured,
    model: status.configured ? status.model : null,
    simulated: status.configured ? status.simulated : false,
    concurrency: env.worker.concurrency,
    once,
  });
  if (!status.configured) {
    log.warn(
      status.reason === "missing_api_key"
        ? `Falta ${status.provider === "gemini" ? "GEMINI_API_KEY" : "XAI_API_KEY"}: el worker no toma trabajos hasta que se configure.`
        : "AI_PROVIDER=mock solo se permite en pruebas o con ALLOW_MOCK_AI=true fuera de producción.",
    );
  }

  const heartbeat = async () => {
    const { error } = await db.rpc("worker_heartbeat", {
      p_worker_id: workerId,
      p_started_at: startedAt,
      p_provider: status.provider,
      p_model: status.configured ? status.model : "",
      p_ai_configured: status.configured,
      p_version: VERSION,
    });
    if (error) log.warn("no se pudo registrar el latido", { detail: error.message });
  };
  await heartbeat();
  const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("deteniendo el worker", { signal, activeJobs: active.size });
    // Se dejan terminar los trabajos en curso un tiempo; si no terminan, el lease vence y otro worker los retoma.
    setTimeout(() => controller.abort(), 25_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const claim = async (): Promise<ImportRow | null> => {
    const { data, error } = await db.rpc("worker_claim_import", { p_worker_id: workerId, p_lease_seconds: env.worker.leaseSeconds });
    if (error) {
      log.error("no se pudo tomar un trabajo", { detail: error.message });
      return null;
    }
    return (data as ImportRow | null) ?? null;
  };

  // Limpieza de importaciones abandonadas durante la subida (no reservaron cuota).
  const expireUploads = async () => {
    const { data, error } = await db.rpc("worker_expire_uploads", { p_older_than_minutes: env.worker.uploadTtlMinutes, p_limit: 100 });
    if (error) {
      log.warn("no se pudieron limpiar las subidas abandonadas", { detail: error.message });
      return;
    }
    const result = data as { expired: number; paths: string[] };
    if (!result.expired) return;
    for (let i = 0; i < result.paths.length; i += 100) {
      const { error: removeError } = await db.storage.from("import-originals").remove(result.paths.slice(i, i + 100));
      if (removeError) log.warn("no se pudieron borrar fotos de subidas abandonadas", { detail: removeError.message });
    }
    log.info("subidas abandonadas canceladas", { expired: result.expired, files: result.paths.length });
  };
  await expireUploads();
  const expireTimer = setInterval(() => void expireUploads(), 10 * 60_000);

  while (!stopping) {
    if (provider) {
      while (!stopping && active.size < env.worker.concurrency) {
        const job = await claim();
        if (!job) break;
        log.info("trabajo tomado", { importId: job.id, attempt: job.attempts, pages: job.page_count });
        const task = processImport(job, {
          db,
          provider,
          leaseSeconds: env.worker.leaseSeconds,
          limits: { maxBytes: env.imports.maxImageBytes, minSide: env.imports.minImageSide, maxSide: env.imports.maxImageSide },
          signal: controller.signal,
        })
          .catch((error) => log.error("fallo no controlado", { importId: job.id, detail: String(error) }))
          .finally(() => active.delete(task));
        active.add(task);
      }
    }
    if (once && active.size === 0) break;
    await Promise.race([new Promise((resolve) => setTimeout(resolve, env.worker.pollIntervalMs)), ...active]);
  }

  await Promise.allSettled(active);
  clearInterval(heartbeatTimer);
  clearInterval(expireTimer);
  log.info("worker detenido", { workerId });
}

main().catch((error) => {
  log.error("el worker terminó con error", { detail: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
