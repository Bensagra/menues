import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/server/supabase/admin";
import { getCurrentUser, type CurrentUser } from "@/server/auth";

/**
 * Verifica que el usuario de la sesión sea administrador de plataforma y
 * devuelve un cliente con clave secreta para las lecturas del panel de
 * administración. Nunca se usa sin esta verificación.
 */
export const requirePlatformAdmin = cache(async (): Promise<{ user: CurrentUser; db: ReturnType<typeof createAdminClient> } | null> => {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar?volver=/admin&motivo=sesion-vencida");
  const db = createAdminClient();
  const { data } = await db.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { user, db };
});
