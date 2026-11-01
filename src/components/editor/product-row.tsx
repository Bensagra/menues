"use client";

import { ArchiveRestore, ArrowDown, ArrowUp, Archive, ChevronDown, Copy, EllipsisVertical, ImageOff, PencilLine, Store } from "lucide-react";
import { cn } from "cn";
import { ProductStatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/domain/money";
import { PRODUCT_STATUS_LABELS, PRODUCT_TAGS, type ProductStatus, type ProductTag } from "@/domain/snapshot";
import { publicMediaUrl } from "@/lib/media-url";
import type { EditorEnv, EditorProduct } from "./types";

export function priceSummary(product: Pick<EditorProduct, "price_minor" | "variants">, currency: string, locale: string): string {
  if (product.variants.length) {
    return product.variants
      .map((v) => `${v.name} ${v.price_minor === null ? "sin precio" : formatMoney(v.price_minor, currency, locale)}`)
      .join(" · ");
  }
  return product.price_minor === null ? "Sin precio" : formatMoney(product.price_minor, currency, locale);
}

export function ProductRow({
  env,
  product,
  index,
  count,
  busy,
  onEdit,
  onStatus,
  onDuplicate,
  onArchive,
  onMove,
  onBranchPrices,
}: {
  env: EditorEnv;
  product: EditorProduct;
  index: number;
  count: number;
  busy: boolean;
  onEdit: () => void;
  onStatus: (status: ProductStatus) => void;
  onDuplicate: () => void;
  onArchive: (archived: boolean) => void;
  onMove: (delta: number) => void;
  onBranchPrices: () => void;
}) {
  const archived = Boolean(product.archived_at);
  const thumb = product.image ? publicMediaUrl(product.image.sm) : null;
  const editable = env.canEditContent && !env.readOnly;
  const hasOverrides = product.overrides.length > 0 || product.variantPrices.length > 0;
  const shared = env.branches.length > 1;

  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:px-4",
        (archived || product.status === "hidden") && "bg-[#faf9f5]",
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background"
        aria-label={`Editar ${product.name}`}
        tabIndex={-1}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <ImageOff className="size-5 text-[#9aa29b]" aria-hidden="true" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="max-w-full text-left">
          <span className={cn("block font-semibold underline-offset-4 hover:underline", archived && "text-muted-foreground line-through")}>
            {product.name}
          </span>
        </button>
        {product.description && <p className="line-clamp-1 text-sm text-muted-foreground">{product.description}</p>}
        <p className="price mt-0.5 text-sm whitespace-normal text-foreground">{priceSummary(product, env.currency, env.locale)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {archived ? <Badge variant="muted">Archivado</Badge> : null}
          {product.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {PRODUCT_TAGS[tag as ProductTag] ?? tag}
            </Badge>
          ))}
          {shared && hasOverrides && (
            <Badge variant="info">
              <Store aria-hidden="true" /> Precio o disponibilidad propia por sucursal
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!archived && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!editable || busy}>
              <Button variant="ghost" size="sm" className="gap-1 px-2" aria-label={`Disponibilidad de ${product.name}: ${PRODUCT_STATUS_LABELS[product.status]}. Cambiar`}>
                <ProductStatusBadge status={product.status} />
                {editable && <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Disponibilidad</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={product.status} onValueChange={(v) => onStatus(v as ProductStatus)}>
                {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((status) => (
                  <DropdownMenuRadioItem key={status} value={status}>
                    {PRODUCT_STATUS_LABELS[status]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Más acciones para ${product.name}`} disabled={busy}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onEdit}>
              <PencilLine aria-hidden="true" /> {editable ? "Editar" : "Ver detalle"}
            </DropdownMenuItem>
            {shared && !archived && !env.readOnly && (
              <DropdownMenuItem onSelect={onBranchPrices}>
                <Store aria-hidden="true" /> Precios por sucursal
              </DropdownMenuItem>
            )}
            {editable && !archived && (
              <>
                <DropdownMenuItem onSelect={onDuplicate}>
                  <Copy aria-hidden="true" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
                  <ArrowUp aria-hidden="true" /> Mover arriba
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
                  <ArrowDown aria-hidden="true" /> Mover abajo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onArchive(true)}>
                  <Archive aria-hidden="true" /> Archivar
                </DropdownMenuItem>
              </>
            )}
            {editable && archived && (
              <DropdownMenuItem onSelect={() => onArchive(false)}>
                <ArchiveRestore aria-hidden="true" /> Restaurar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
