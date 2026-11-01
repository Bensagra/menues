"use client";

import { useCallback, useEffect, useRef } from "react";
import { PublicMenu } from "./public-menu";
import type { PublicMenuData } from "./types";

// Envía eventos anónimos y agregables (visita, consulta de producto, búsqueda).
// Sin cookies ni identificadores personales; se cuenta una visita por pestaña.
function track(slug: string, event: "menu_view" | "product_view" | "search", productId?: string) {
  try {
    const body = JSON.stringify({ slug, event, productId });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    // Las estadísticas nunca deben romper la carta.
  }
}

export function PublicMenuClient({ data, serverNow }: { data: PublicMenuData; serverNow: number }) {
  const slug = data.branch.public_slug;
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    const key = `cl_visit_${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // modo privado: igual se registra una vez por carga
    }
    track(slug, "menu_view");
  }, [slug]);

  const onProductView = useCallback(
    (productId: string) => {
      if (viewed.current.has(productId)) return;
      viewed.current.add(productId);
      track(slug, "product_view", productId);
    },
    [slug],
  );
  const onSearch = useCallback(() => track(slug, "search"), [slug]);

  return <PublicMenu data={data} serverNow={serverNow} onProductView={onProductView} onSearch={onSearch} pageBackground />;
}
