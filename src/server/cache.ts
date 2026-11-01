import "server-only";
import { updateTag } from "next/cache";

export const publicMenuTag = (slug: string) => `public-menu:${slug}`;

/**
 * Invalida la caché de cartas públicas después de publicar, archivar,
 * suspender o cambiar datos del local. Solo desde Server Actions.
 */
export function invalidatePublicMenus(slugs: (string | null | undefined)[]) {
  for (const slug of new Set(slugs.filter((s): s is string => Boolean(s)))) {
    updateTag(publicMenuTag(slug));
  }
}
