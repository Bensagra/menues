import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Download, FileText, Info, MessageCircle, Printer, TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { qrSvg } from "@/server/qr";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "QR y difusión" };

export default function QrPage(props: PageProps<"/panel/[negocio]/qr">) {
  return (
    <Suspense fallback={<PageSkeleton rows={2} />}>
      <Qr params={props.params} />
    </Suspense>
  );
}

async function Qr({ params }: { params: PageProps<"/panel/[negocio]/qr">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const supabase = await createClient();
  const { data: published } = await supabase
    .from("menu_branches")
    .select("branch_id, published_version_id, menus!inner(status)")
    .eq("business_id", ctx.business.id)
    .eq("menus.status", "active")
    .not("published_version_id", "is", null);
  const publishedBranches = new Set((published ?? []).map((p) => p.branch_id));
  const appUrl = publicEnv().appUrl;
  const branches = await Promise.all(
    ctx.branches.map(async (b) => {
      const url = `${appUrl}/m/${b.public_slug}`;
      return { ...b, url, svg: await qrSvg(url), published: publishedBranches.has(b.id) };
    }),
  );
  const base = `/panel/${ctx.business.slug}`;

  return (
    <>
      <PageHeader title="QR y difusión" description="Compartí tu carta con un enlace permanente o un código QR para las mesas." />
      <Alert variant="info" className="mb-6">
        <Info aria-hidden="true" />
        <AlertDescription>
          El QR de cada sucursal es permanente: lleva siempre a su carta publicada. Aunque cambies precios o productos, no hace falta volver a imprimirlo.
        </AlertDescription>
      </Alert>
      <div className="grid gap-5">
        {branches.map((b) => (
          <section key={b.id} aria-labelledby={`qr-${b.id}`} className="grid gap-5 rounded-xl border border-border bg-card p-5 sm:grid-cols-[200px_1fr]">
            <div
              className="mx-auto w-48 overflow-hidden rounded-lg border border-border sm:mx-0 [&>svg]:h-auto [&>svg]:w-full"
              role="img"
              aria-label={`Código QR de la carta de ${b.name}`}
              dangerouslySetInnerHTML={{ __html: b.svg }}
            />
            <div className="grid content-start gap-3">
              <h2 id={`qr-${b.id}`} className="text-lg font-bold">
                {b.name}
              </h2>
              {!b.published && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Todavía no hay una carta publicada en esta sucursal: quien escanee verá un aviso. <Link href={`${base}/menus`}>Publicá una carta</Link>.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-1.5">
                <label htmlFor={`url-${b.id}`} className="text-sm font-semibold">
                  Enlace de la carta
                </label>
                <input
                  id={`url-${b.id}`}
                  readOnly
                  value={b.url}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  onFocus={undefined}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={b.url} />
                <Button asChild variant="outline">
                  <a href={`${base}/qr/descargar?sucursal=${b.id}&formato=png`} download>
                    <Download aria-hidden="true" /> QR en PNG
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`${base}/qr/descargar?sucursal=${b.id}&formato=svg`} download>
                    <Download aria-hidden="true" /> QR en SVG (para imprenta)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/imprimir/qr/${ctx.business.slug}?sucursal=${b.id}`} target="_blank">
                    <Printer aria-hidden="true" /> Vista imprimible
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/imprimir/carta/${ctx.business.slug}?sucursal=${b.id}`} target="_blank">
                    <FileText aria-hidden="true" /> Carta para imprimir
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Mirá la carta de ${ctx.business.name} (${b.name}): ${b.url}`)}`} target="_blank" rel="noopener">
                    <MessageCircle aria-hidden="true" /> Compartir por WhatsApp
                  </a>
                </Button>
                <Button asChild variant="ghost">
                  <a href={b.url} target="_blank" rel="noopener">
                    <ArrowUpRight aria-hidden="true" /> Abrir carta
                  </a>
                </Button>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
