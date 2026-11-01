import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { PRODUCT_TAGS, type ProductTag, type SnapshotProduct } from "@/domain/snapshot";
import { formatDate } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { publicMediaUrl } from "@/lib/media-url";
import { getBusinessContext } from "@/server/auth";
import { getPublicMenu } from "@/server/public-menu";
import { qrSvg } from "@/server/qr";

export const metadata: Metadata = { title: "Carta para imprimir" };

type Props = PageProps<"/imprimir/carta/[negocio]">;

export default function PrintMenuPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Preparando la carta para imprimir…</p>}>
      <PrintMenu params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function Option({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold ${active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}

async function PrintMenu({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const [{ negocio }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getBusinessContext(negocio);
  const branch = ctx.branches.find((b) => b.id === sp.sucursal) ?? ctx.activeBranch;
  if (!branch) notFound();
  const withDescriptions = sp.descripciones !== "no";
  const twoColumns = sp.columnas !== "1";
  const base = `/imprimir/carta/${ctx.business.slug}`;
  const query = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ sucursal: branch.id, ...(withDescriptions ? {} : { descripciones: "no" }), ...(twoColumns ? {} : { columnas: "1" }), ...overrides });
    for (const [k, v] of [...p.entries()]) if (v === "") p.delete(k);
    return `${base}?${p.toString()}`;
  };

  // Siempre desde la versión publicada: lo mismo que ven los clientes.
  const result = await getPublicMenu(branch.public_slug);
  const url = `${publicEnv().appUrl}/m/${branch.public_slug}`;
  const toolbar = (
    <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
      <Button asChild variant="outline">
        <Link href={`/panel/${ctx.business.slug}/qr`}>← Volver</Link>
      </Button>
      {result.status === "ok" && (
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Opciones de impresión" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
            <Option href={query({ columnas: "" })} active={twoColumns}>
              Dos columnas
            </Option>
            <Option href={query({ columnas: "1" })} active={!twoColumns}>
              Una columna
            </Option>
            <Option href={query({ descripciones: withDescriptions ? "no" : "" })} active={withDescriptions}>
              {withDescriptions ? "Con descripciones" : "Sin descripciones"}
            </Option>
          </nav>
          <PrintButton />
        </div>
      )}
    </div>
  );

  if (result.status !== "ok") {
    return (
      <main className="min-h-dvh bg-[#ebe8df] px-4 py-8">
        {toolbar}
        <p className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
          {result.status === "unpublished"
            ? `${branch.name} todavía no tiene una carta publicada. Publicala para poder imprimirla.`
            : "La carta de esta sucursal no está disponible en este momento."}
        </p>
      </main>
    );
  }

  const { business, menus } = result.data;
  const currency = menus[0]?.snapshot.currency ?? business.currency;
  const fmt = (minor: number | null) => (minor === null ? "" : formatMoney(minor, currency, business.locale));
  const color = business.brand_color ?? "#214E3B";
  const logo = business.logo ? publicMediaUrl(business.logo.sm) : null;
  const latest = menus
    .map((m) => m.published_at)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const svg = await qrSvg(url);

  const productLine = (p: SnapshotProduct) => (
    <li key={p.id} className="break-inside-avoid py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{p.name}</span>
        {p.price_minor !== null && (
          <>
            <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-[#b9b4a6]" />
            <span className="price font-semibold whitespace-nowrap">{fmt(p.price_minor)}</span>
          </>
        )}
      </div>
      {p.variants.length > 0 && (
        <p className="price text-[13px]">
          {p.variants
            .filter((v) => v.price_minor !== null)
            .map((v) => `${v.name} ${fmt(v.price_minor)}`)
            .join(" · ")}
        </p>
      )}
      {withDescriptions && p.description && <p className="text-[13px] leading-snug text-[#4b544d]">{p.description}</p>}
      {(p.tags.length > 0 || p.extras.length > 0) && (
        <p className="text-[12px] text-[#4b544d]">
          {[
            p.tags.map((t) => PRODUCT_TAGS[t as ProductTag] ?? t).join(" · "),
            p.extras.length ? `Extras: ${p.extras.map((e) => `${e.name} ${fmt(e.price_minor)}`).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(" — ")}
        </p>
      )}
    </li>
  );

  return (
    <main className="min-h-dvh bg-[#ebe8df] px-4 py-8 print:bg-white print:p-0">
      {toolbar}
      <article className="mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-[14px] text-[#202a24] shadow-md print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 flex items-center gap-4 border-b-2 pb-4" style={{ borderColor: color }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-16 shrink-0 object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight" style={{ color }}>
              {business.name}
            </h1>
            <p className="font-semibold">
              {branch.name}
              {result.data.branch.address ? ` · ${result.data.branch.address}` : ""}
              {result.data.branch.phone ? ` · ${result.data.branch.phone}` : ""}
            </p>
          </div>
        </header>

        {menus.map((menu) => (
          <section key={menu.menu_id} className="mb-6">
            {menus.length > 1 && <h2 className="mb-3 font-display text-2xl font-semibold">{menu.snapshot.menu.name}</h2>}
            <div className={twoColumns ? "gap-10 sm:columns-2 print:columns-2" : ""}>
              {menu.snapshot.categories.map((category) => (
                <section key={category.id} className="mb-5 break-inside-avoid-column">
                  <h3 className="mb-1 font-display text-xl font-semibold break-after-avoid" style={{ color }}>
                    {category.name}
                  </h3>
                  {withDescriptions && category.description && <p className="mb-1 text-[13px] text-[#4b544d]">{category.description}</p>}
                  <ul>{category.products.map(productLine)}</ul>
                </section>
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-6 flex items-center gap-4 border-t border-[#dee3da] pt-4 text-[12px] text-[#4b544d] break-inside-avoid">
          <div className="w-20 shrink-0 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label="Código QR de la carta" dangerouslySetInnerHTML={{ __html: svg }} />
          <p>
            Precios en {currency}. Carta publicada el {latest ? formatDate(latest, branch.timezone) : "—"}.
            <br />
            Escaneá el código para ver la carta siempre actualizada: <span className="break-all">{url}</span>
          </p>
        </footer>
      </article>
    </main>
  );
}
