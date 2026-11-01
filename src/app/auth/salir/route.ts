import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/server/supabase/server";

// Cierre de sesión (POST, para que un enlace o imagen no pueda cerrar la sesión).
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/ingresar?motivo=salida", publicEnv().appUrl), { status: 303 });
}
