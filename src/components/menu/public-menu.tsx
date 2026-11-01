"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "cn";
import { Clock, MapPin, MessageCircle, Phone, Search, Store, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/domain/money";
import { PRODUCT_TAGS, type ProductTag, type SnapshotProduct } from "@/domain/snapshot";
import { nameKey } from "@/domain/text";
import { describeOpenStatus, hoursByDay, openStatus, type OpenStatus } from "@/domain/time";
import { publicMediaUrl } from "@/lib/media-url";
import { PromotionsStrip } from "./promotions-strip";
import type { PublicMenuData } from "./types";

function useOpenStatus(data: PublicMenuData) {
  const [status, setStatus] = useState<OpenStatus | null>(null);
  useEffect(() => {
    const update = () => setStatus(openStatus(data.branch.opening_hours, new Date(), data.branch.timezone));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [data.branch.opening_hours, data.branch.timezone]);
  return status;
}

function productMatches(product: SnapshotProduct, q: string) {
  if (!q) return true;
  const text = nameKey([product.name, product.description, ...product.variants.map((v) => v.name)].join(" "));
  return q.split(" ").every((word) => text.includes(word));
}

export function PublicMenu({
  data,
  serverNow,
  onProductView,
  onSearch,
}: {
  data: PublicMenuData;
  serverNow: number;
  onProductView?: (productId: string) => void;
  onSearch?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SnapshotProduct | null>(null);
  const [showHours, setShowHours] = useState(false);
  const status = useOpenStatus(data);
  const { business, branch } = data;
  const currency = data.menus[0]?.snapshot.currency ?? business.currency;
  const fmt = (minor: number | null) => (minor === null ? "" : formatMoney(minor, currency, business.locale));
  const q = nameKey(query);
  const brandStyle = { "--brand": business.brand_color ?? "#214E3B" } as CSSProperties;

  const menus = useMemo(
    () =>
      data.menus.map((menu) => ({
        ...menu,
        categories: menu.snapshot.categories
          .map((c) => ({ ...c, products: c.products.filter((p) => productMatches(p, q)) }))
          .filter((c) => c.products.length > 0),
      })),
    [data.menus, q],
  );
  const total = menus.reduce((sum, m) => sum + m.categories.reduce((s, c) => s + c.products.length, 0), 0);
  const allCategories = menus.flatMap((m) => m.categories.map((c) => ({ id: c.id, name: c.name })));
  const coverUrl = business.cover ? publicMediaUrl(business.cover.lg) : null;
  const logoUrl = business.logo ? publicMediaUrl(business.logo.sm) : null;
  const hours = hoursByDay(branch.opening_hours);

  useEffect(() => {
    if (!q || !onSearch) return;
    const timer = setTimeout(onSearch, 1500);
    return () => clearTimeout(timer);
  }, [q, onSearch]);

  return (
    <div style={brandStyle} className="min-h-dvh bg-background">
      <div className="h-1.5 bg-brand" aria-hidden="true" />
      <header className="mx-auto max-w-3xl">
        {coverUrl && (
          <div className="aspect-[16/7] w-full overflow-hidden sm:mt-4 sm:rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt="" className="size-full object-cover" fetchPriority="high" />
          </div>
        )}
        <div className="px-4 pt-6 pb-4 sm:px-6">
          <div className="flex items-start gap-4">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo de ${business.name}`} className="size-16 shrink-0 rounded-xl border border-border bg-card object-contain" />
            )}
            <div className="min-w-0">
              <h1 className="font-display text-[34px] leading-[1.05] font-semibold tracking-tight text-balance text-brand sm:text-5xl">
                {business.name}
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-base font-semibold">
                <Store className="size-4 text-muted-foreground" aria-hidden="true" />
                {branch.name}
              </p>
            </div>
          </div>
          {business.description && <p className="mt-3 text-pretty text-muted-foreground">{business.description}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {status && status.state !== "unknown" && (
              <button
                type="button"
                onClick={() => setShowHours((v) => !v)}
                aria-expanded={showHours}
                aria-controls="horarios"
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-4 hover:underline",
                  status.state === "open" ? "text-success" : "text-warning",
                )}
              >
                <Clock className="size-4" aria-hidden="true" />
                {describeOpenStatus(status)}
              </button>
            )}
            {branch.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.address}`)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground underline-offset-4 hover:underline"
              >
                <MapPin className="size-4" aria-hidden="true" />
                {branch.address}
              </a>
            )}
            {branch.phone && (
              <a href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground underline-offset-4 hover:underline">
                <Phone className="size-4" aria-hidden="true" />
                {branch.phone}
              </a>
            )}
            {branch.whatsapp && (
              <a
                href={`https://wa.me/${branch.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground underline-offset-4 hover:underline"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                WhatsApp
              </a>
            )}
          </div>
          {status?.state === "closed" && (
            <p className="mt-2 rounded-lg border border-warning/25 bg-warning-surface px-3 py-2 text-sm text-warning" role="status">
              El local está cerrado ahora. Igual podés consultar la carta.
            </p>
          )}
          {showHours && hours.some((d) => d.ranges.length) && (
            <div id="horarios" className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
              <p className="mb-2 font-semibold">Horarios</p>
              <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
                {hours.map((d) => (
                  <div key={d.day} className="contents">
                    <dt className="capitalize text-muted-foreground">{d.label}</dt>
                    <dd className="price">{d.ranges.length ? d.ranges.join(", ") : "Cerrado"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {branch.public_note && <p className="mt-3 text-sm text-muted-foreground">{branch.public_note}</p>}
        </div>
      </header>

      <div className="sticky top-0 z-20 border-y border-border bg-background">
        <div className="mx-auto max-w-3xl px-4 py-2 sm:px-6">
          <label htmlFor="buscar" className="sr-only">
            Buscar en la carta
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              id="buscar"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en la carta"
              className="h-11 w-full rounded-lg border border-input bg-card pr-10 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground"
                aria-label="Borrar búsqueda"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          {!q && allCategories.length > 1 && (
            <nav aria-label="Categorías" className="-mx-4 mt-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
              <ul className="flex gap-2 pb-1">
                {allCategories.map((c) => (
                  <li key={c.id} className="shrink-0">
                    <a
                      href={`#c-${c.id}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold whitespace-nowrap hover:border-brand hover:text-brand"
                    >
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>

      <main id="contenido" className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6">
        {!q && data.promotions.length > 0 && (
          <PromotionsStrip promotions={data.promotions} timeZone={branch.timezone} currency={currency} locale={business.locale} serverNow={serverNow} />
        )}
        {q && (
          <p className="mb-4 text-sm text-muted-foreground" role="status" aria-live="polite">
            {total === 0 ? "" : `${total} ${total === 1 ? "resultado" : "resultados"} para «${query}»`}
          </p>
        )}
        {total === 0 && q ? (
          <div className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-8 text-center" role="status">
            <p className="font-semibold">No encontramos «{query}»</p>
            <p className="mt-1 text-sm text-muted-foreground">Probá con otra palabra o revisá la carta completa.</p>
            <button type="button" onClick={() => setQuery("")} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
              Ver toda la carta
            </button>
          </div>
        ) : total === 0 ? (
          <p className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-8 text-center text-muted-foreground">
            La carta todavía no tiene productos.
          </p>
        ) : (
          menus.map((menu) => (
            <div key={menu.menu_id} className="mb-10">
              {data.menus.length > 1 && (
                <h2 className="mb-4 font-display text-3xl font-semibold tracking-tight">{menu.snapshot.menu.name}</h2>
              )}
              {menu.snapshot.menu.description && data.menus.length > 1 && <p className="-mt-2 mb-4 text-muted-foreground">{menu.snapshot.menu.description}</p>}
              {menu.categories.map((category) => (
                <section key={category.id} id={`c-${category.id}`} aria-labelledby={`h-${category.id}`} className="mb-8 scroll-mt-36">
                  <h3 id={`h-${category.id}`} className="font-display text-2xl font-semibold tracking-tight text-brand">
                    {category.name}
                  </h3>
                  {category.description && <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>}
                  <ul className="mt-3 divide-y divide-dashed divide-[#d5dacf]">
                    {category.products.map((product) => (
                      <li key={product.id}>
                        <ProductItem
                          product={product}
                          fmt={fmt}
                          onOpen={() => {
                            setSelected(product);
                            onProductView?.(product.id);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))
        )}

        {branch.other_branches.length > 0 && (
          <section aria-labelledby="otras-sucursales" className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 id="otras-sucursales" className="text-sm font-bold">
              Otras sucursales de {business.name}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {branch.other_branches.map((b) => (
                <li key={b.public_slug}>
                  <a href={`/m/${b.public_slug}`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary">
                    {b.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-10 text-[13px] text-muted-foreground sm:px-6">
        <p>Precios en {currency === "ARS" ? "pesos argentinos" : currency} ({currency}). Pueden cambiar sin aviso.</p>
        <p className="mt-1">Las etiquetas (por ejemplo «Sin TACC») las indica el local. Ante cualquier alergia, consultá al personal.</p>
        <p className="mt-3">Carta digital hecha con CartaLista.</p>
      </footer>

      <ProductDialog product={selected} fmt={fmt} onClose={() => setSelected(null)} />
    </div>
  );
}

function PriceLine({ product, fmt }: { product: SnapshotProduct; fmt: (m: number | null) => string }) {
  if (product.variants.length) {
    return (
      <p className="price text-[15px] whitespace-normal">
        {product.variants.map((v, i) => (
          <span key={v.id}>
            {i > 0 && <span className="text-muted-foreground"> · </span>}
            <span className="text-muted-foreground">{v.name}</span> <span className="font-semibold">{fmt(v.price_minor)}</span>
          </span>
        ))}
      </p>
    );
  }
  if (product.price_minor === null) return null;
  return <p className="price text-[15px] font-semibold">{fmt(product.price_minor)}</p>;
}

function ProductItem({ product, fmt, onOpen }: { product: SnapshotProduct; fmt: (m: number | null) => string; onOpen: () => void }) {
  const soldOut = product.status === "sold_out";
  const image = product.image ? publicMediaUrl(product.image.sm) : null;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-4 py-4 text-left">
      <span className="min-w-0 flex-1">
        <span className={cn("flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold", soldOut && "text-muted-foreground")}>
          {product.name}
          {soldOut && <span className="rounded-full bg-warning-surface px-2 py-0.5 text-xs font-bold text-warning">Agotado</span>}
        </span>
        {product.description && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{product.description}</span>}
        <span className={cn("mt-1 block", soldOut && "opacity-70")}>
          <PriceLine product={product} fmt={fmt} />
        </span>
        {product.tags.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {product.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {PRODUCT_TAGS[tag as ProductTag] ?? tag}
              </span>
            ))}
          </span>
        )}
      </span>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          className={cn("size-24 shrink-0 rounded-lg border border-border object-cover", soldOut && "grayscale")}
        />
      )}
    </button>
  );
}

function ProductDialog({ product, fmt, onClose }: { product: SnapshotProduct | null; fmt: (m: number | null) => string; onClose: () => void }) {
  const image = product?.image ? publicMediaUrl(product.image.lg) : null;
  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {product && (
          <>
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={product.name} className="aspect-[4/3] w-full object-cover" width={product.image?.w} height={product.image?.h} />
            )}
            <div className="grid gap-3 p-5">
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-2xl font-semibold">{product.name}</DialogTitle>
                {product.description ? (
                  <DialogDescription className="text-base text-muted-foreground">{product.description}</DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">Detalle del producto</DialogDescription>
                )}
              </DialogHeader>
              {product.status === "sold_out" && (
                <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm font-semibold text-warning">Agotado por el momento</p>
              )}
              {product.variants.length > 0 ? (
                <dl className="grid gap-1.5">
                  {product.variants.map((v) => (
                    <div key={v.id} className="flex justify-between gap-4 border-b border-dashed border-border pb-1.5">
                      <dt>{v.name}</dt>
                      <dd className="price font-semibold">{fmt(v.price_minor)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                product.price_minor !== null && <p className="price text-lg font-semibold">{fmt(product.price_minor)}</p>
              )}
              {product.extras.length > 0 && (
                <div>
                  <p className="text-sm font-bold">Extras</p>
                  <ul className="mt-1 grid gap-1 text-sm">
                    {product.extras.map((e) => (
                      <li key={e.id} className="flex justify-between gap-4">
                        <span>{e.name}</span>
                        <span className="price">+{fmt(e.price_minor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {product.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {product.tags.map((tag) => (
                    <li key={tag} className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      {PRODUCT_TAGS[tag as ProductTag] ?? tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
