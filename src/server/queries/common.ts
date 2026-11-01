import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/server/supabase/server";

/** Devuelve los datos o lanza: un error de consulta nunca debe verse como "lista vacía". */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (result.error) {
    console.error(`[query] ${what}:`, result.error.code, result.error.message);
    throw new Error(`No se pudo cargar: ${what}`);
  }
  return result.data as T;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Nombres visibles de usuarios (RLS: solo quienes comparten negocio). */
export async function profileNames(supabase: Client, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email]));
}

export function publicMenuUrl(appUrl: string, slug: string) {
  return `${appUrl}/m/${slug}`;
}
