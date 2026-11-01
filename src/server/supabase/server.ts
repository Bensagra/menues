import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";

/**
 * Cliente con la sesión del usuario (cookies). Las consultas pasan por RLS.
 * Crear uno por petición.
 */
export async function createClient() {
  // La sesión se valida contra la hora actual (vencimiento del JWT): siempre en tiempo de petición.
  await connection();
  const cookieStore = await cookies();
  const env = publicEnv();
  return createServerClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies: el proxy refresca la sesión.
        }
      },
    },
  });
}
