import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv, requireSecretKey } from "@/lib/env";

export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Cliente con la clave secreta (omite RLS). Solo para el servidor, el worker y
 * los scripts, siempre después de verificar la identidad y los permisos.
 */
export function createServiceClient(): AppSupabaseClient {
  if (typeof window !== "undefined") throw new Error("La clave secreta no puede usarse en el navegador");
  return createClient<Database>(publicEnv().supabaseUrl, requireSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-client-info": "cartalista-server" } },
  });
}

/** Cliente anónimo sin cookies: solo puede leer lo público (menú publicado). */
export function createAnonClient(): AppSupabaseClient {
  return createClient<Database>(publicEnv().supabaseUrl, publicEnv().supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
