import { createAdminClient } from "@/server/supabase/admin";
import { createClient } from "@/server/supabase/server";
import { createRateLimiter, isAutomatedClient, isSameOrigin, trackEventSchema } from "@/server/track";

// Registro anónimo de visitas a la carta pública. Siempre responde 204: no
// revela si el evento se contó. No guarda IP, user agent ni identificadores.

const allow = createRateLimiter({ limit: 60, windowMs: 60_000 });
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const headers = request.headers;
  if (!isSameOrigin(headers.get("origin"), headers.get("sec-fetch-site"), headers.get("host"))) return NO_CONTENT();
  if (isAutomatedClient(headers.get("user-agent"))) return NO_CONTENT();
  const client = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
  if (!allow(client)) return NO_CONTENT();

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > 1024) return NO_CONTENT();
  let parsed;
  try {
    parsed = trackEventSchema.safeParse(JSON.parse(raw));
  } catch {
    return NO_CONTENT();
  }
  if (!parsed.success) return NO_CONTENT();
  const { slug, event, productId } = parsed.data;

  // Si hay sesión, se identifica a quien mira para no contar al equipo ni a la plataforma.
  let viewerId: string | null = null;
  const hasSession = (headers.get("cookie") ?? "").includes("-auth-token");
  if (hasSession) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getClaims();
      viewerId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    } catch {
      viewerId = null;
    }
  }

  try {
    const { error } = await createAdminClient().rpc("server_track_event", {
      p_slug: slug,
      p_event: event,
      p_product_id: event === "product_view" ? (productId ?? null) : null,
      p_viewer_id: viewerId,
    } as never);
    if (error) console.error("[track] no se pudo registrar", error.code);
  } catch (error) {
    console.error("[track] no se pudo registrar", error instanceof Error ? error.message : "error");
  }
  return NO_CONTENT();
}
