import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createClient } from "@/server/supabase/server";

// Destino de los enlaces de email (confirmación, recuperación, cambio de email).
// Verifica el token y crea la sesión con cookies.

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const env = publicEnv();
  const fallback = type === "recovery" ? "/restablecer" : "/bienvenida";
  const next = safeInternalPath(searchParams.get("next"), env.appUrl, fallback);

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const destination = type === "recovery" ? "/restablecer" : next;
      return NextResponse.redirect(new URL(destination, env.appUrl));
    }
  }
  return NextResponse.redirect(new URL("/ingresar?motivo=enlace-invalido", env.appUrl));
}
