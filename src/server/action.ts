import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { appError, type AppError } from "@/lib/errors";
import { createClient } from "@/server/supabase/server";
import { getCurrentUser, type CurrentUser } from "@/server/auth";

import type { ActionResult } from "@/lib/action-result";

export type { ActionResult };

/** Error de dominio que se devuelve al cliente como resultado (no como excepción). */
export class ActionFailure extends Error {
  constructor(
    public readonly error: AppError,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(error.code);
  }
}

export function fail(code: string, detail?: string, field?: string): never {
  throw new ActionFailure(appError(code, detail, field));
}

/** Traduce un error de PostgREST/Postgres (app.fail → SQLSTATE PTxyz) a un error de dominio. */
export function fromPostgrest(error: PostgrestError): AppError {
  const code = error.message && /^[a-z_]+$/.test(error.message) ? error.message : "unknown";
  if (code === "unknown") {
    console.error("[db] error inesperado", { code: error.code, message: error.message, hint: error.hint });
  }
  if (code === "not_authenticated") return appError("session_expired");
  return appError(code, error.details || undefined);
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ActionFailure(appError("validation"), zodFieldErrors(parsed.error));
  }
  return parsed.data;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ActionContext {
  supabase: ServerClient;
  user: CurrentUser;
}

/**
 * Ejecuta una Server Action autenticada. La identidad sale siempre de la sesión
 * verificada, nunca de datos del cliente.
 */
export async function authedAction<T>(fn: (ctx: ActionContext) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, error: appError("session_expired") };
    const supabase = await createClient();
    const data = await fn({ supabase, user });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ActionFailure) return { ok: false, error: error.error, fieldErrors: error.fieldErrors };
    // redirect()/notFound() de Next.js usan excepciones de control: se relanzan.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[action] error inesperado", error instanceof Error ? error.message : error);
    return { ok: false, error: appError("unknown") };
  }
}

/** Llama una función RPC y lanza ActionFailure ante un error de dominio. */
type LooseRpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: PostgrestError | null }> };

export async function rpc<T = unknown>(supabase: { rpc: unknown }, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as unknown as LooseRpcClient).rpc(fn, args);
  if (error) throw new ActionFailure(fromPostgrest(error));
  return data as T;
}
