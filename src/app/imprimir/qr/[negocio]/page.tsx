import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { publicMediaUrl } from "@/lib/media-url";
import { getBusinessContext } from "@/server/auth";
import { qrSvg } from "@/server/qr";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "QR para imprimir" };

type Props = PageProps<"/imprimir/qr/[negocio]">;

export default function PrintQrPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Preparando la vista para imprimir…</p>}>
      <PrintQr params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PrintQr({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const { negocio } = await params;
  const sp = await searchParams;
  const ctx = await getBusinessContext(negocio);
  const branch = ctx.branches.find((b) => b.id === sp.sucursal) ?? ctx.activeBranch;
  if (!branch) notFound();
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("name, brand_color, logo:media!businesses_logo_fk(path_sm)")
    .eq("id", ctx.business.id)
    .single();
  const url = `${publicEnv().appUrl}/m/${branch.public_slug}`;
  const svg = await qrSvg(url);
  const logo = (business?.logo as unknown as { path_sm: string } | null)?.path_sm;
  const color = business?.brand_color ?? "#214E3B";

  return (
    <main className="min-h-dvh bg-[#ebe8df] px-4 py-8 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-6 flex max-w-md flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href={`/panel/${ctx.business.slug}/qr`}>← Volver</Link>
        </Button>
        <PrintButton />
      </div>
      <article className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-white px-10 py-12 text-center shadow-md print:max-w-none print:border-0 print:shadow-none">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={publicMediaUrl(logo) ?? ""} alt="" className="mb-4 size-20 object-contain" />
        )}
        <h1 className="font-display text-4xl font-semibold tracking-tight" style={{ color }}>
          {business?.name ?? ctx.business.name}
        </h1>
        <p className="mt-1 text-lg font-semibold text-foreground">{branch.name}</p>
        <div
          className="mt-8 w-64 [&>svg]:h-auto [&>svg]:w-full"
          role="img"
          aria-label="Código QR de la carta"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-8 font-display text-2xl font-semibold">Escaneá y mirá nuestra carta</p>
        <p className="mt-2 text-sm break-all text-muted-foreground">{url}</p>
      </article>
    </main>
  );
}
