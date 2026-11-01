import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ADMIN_PAGE_SIZE = 25;

export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

/** Texto de búsqueda seguro para filtros de PostgREST (sin comas, comodines ni paréntesis). */
export function searchTerm(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}@.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function paramValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function Pagination({
  basePath,
  params,
  page,
  total,
  pageSize = ADMIN_PAGE_SIZE,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  total: number;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const search = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), pagina: String(p) });
    return `${basePath}?${search.toString()}`;
  };
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground tabular-nums">
        Página {page} de {pages} · {total} en total
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>
              <ChevronLeft aria-hidden="true" /> Anterior
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden="true" /> Anterior
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>
              Siguiente <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Siguiente <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </span>
    </nav>
  );
}
