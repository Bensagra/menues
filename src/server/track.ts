import { z } from "zod";

// Utilidades puras del registro de visitas (se prueban sin servidor).

export const trackEventSchema = z.object({
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/),
  event: z.enum(["menu_view", "product_view", "search"]),
  productId: z.string().uuid().optional(),
});

export type TrackEvent = z.infer<typeof trackEventSchema>;

const BOT_PATTERN =
  /bot|crawl|spider|slurp|scrap|preview|facebookexternalhit|whatsapp|telegram|discord|slack|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python-requests|httpclient|go-http-client/i;

/** Clientes automáticos (buscadores, vistas previas de enlaces, monitores) no suman visitas. */
export function isAutomatedClient(userAgent: string | null): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_PATTERN.test(userAgent);
}

/** Los eventos solo se aceptan desde la propia aplicación (sendBeacon envía Origin). */
export function isSameOrigin(origin: string | null, fetchSite: string | null, host: string | null): boolean {
  if (fetchSite && fetchSite !== "same-origin") return false;
  if (!origin) return true;
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Límite de eventos por cliente y minuto, en memoria del proceso. Es una
 * defensa de mejor esfuerzo contra inflar números: la IP no se guarda en
 * ningún lado y la tabla se vacía sola.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
