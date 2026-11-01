import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { qrPng, qrSvg } from "@/server/qr";
import { createClient } from "@/server/supabase/server";

// Descarga del QR (PNG o SVG) de una sucursal. Requiere sesión y acceso a la sucursal (RLS).
export async function GET(request: NextRequest, ctx: RouteContext<"/panel/[negocio]/qr/descargar">) {
  const { negocio } = await ctx.params;
  const branchId = request.nextUrl.searchParams.get("sucursal") ?? "";
  const format = request.nextUrl.searchParams.get("formato") === "svg" ? "svg" : "png";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "session_expired" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(branchId)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: branch } = await supabase
    .from("branches")
    .select("public_slug, name, businesses!inner(slug)")
    .eq("id", branchId)
    .eq("businesses.slug", negocio)
    .maybeSingle();
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = `${publicEnv().appUrl}/m/${branch.public_slug}`;
  const filename = `qr-${branch.public_slug}.${format}`;
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
  };
  if (format === "svg") {
    return new NextResponse(await qrSvg(url), { headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" } });
  }
  return new NextResponse(new Uint8Array(await qrPng(url)), { headers: { ...headers, "Content-Type": "image/png" } });
}
