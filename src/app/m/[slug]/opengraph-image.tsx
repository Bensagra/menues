import { ImageResponse } from "next/og";
import { getPublicMenu } from "@/server/public-menu";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Carta digital";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPublicMenu(slug);
  const ok = result.status === "ok" || result.status === "unpublished";
  const name = ok ? result.data.business.name : "Carta digital";
  const branch = ok ? result.data.branch.name : "";
  const color = ok && result.data.business.brand_color ? result.data.business.brand_color : "#214E3B";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F7F5EF",
          padding: "72px",
          borderTop: `24px solid ${color}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, color: "#626B64" }}>Carta digital</div>
          <div style={{ fontSize: 96, fontWeight: 700, color, lineHeight: 1.05, marginTop: 16 }}>{name}</div>
          {branch ? <div style={{ fontSize: 48, color: "#202A24", marginTop: 16 }}>{branch}</div> : null}
        </div>
        <div style={{ fontSize: 32, color: "#626B64" }}>Mirá precios y disponibilidad actualizados</div>
      </div>
    ),
    size,
  );
}
