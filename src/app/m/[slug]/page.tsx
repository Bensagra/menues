import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CircleSlash, Clock } from "lucide-react";
import { PublicMenuClient } from "@/components/menu/public-menu-client";
import { Skeleton } from "@/components/ui/skeleton";
import { requestTime } from "@/server/clock";
import { getPublicMenu } from "@/server/public-menu";

export async function generateMetadata(props: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const result = await getPublicMenu(slug);
  if (result.status === "not_found") return { title: "Carta no encontrada", robots: { index: false } };
  if (result.status === "unavailable") return { title: "Carta no disponible", robots: { index: false } };
  const { business, branch } = result.data;
  const title = `Carta de ${business.name} · ${branch.name}`;
  const description = business.description || `Consultá la carta de ${business.name} en ${branch.name}: precios, variantes y disponibilidad.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website", locale: business.locale.replace("-", "_") },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: `/m/${slug}` },
  };
}

export default function PublicMenuPage(props: PageProps<"/m/[slug]">) {
  return (
    <Suspense fallback={<PublicMenuSkeleton />}>
      <PublicMenuContent params={props.params} />
    </Suspense>
  );
}

async function PublicMenuContent({ params }: { params: PageProps<"/m/[slug]">["params"] }) {
  const { slug } = await params;
  const result = await getPublicMenu(slug);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") {
    return (
      <StateScreen icon={<CircleSlash className="size-7" aria-hidden="true" />} title="Esta carta no está disponible en este momento">
        {result.businessName ? `${result.businessName}${result.branchName ? ` · ${result.branchName}` : ""}. ` : ""}Volvé a intentar más tarde o
        consultá al personal del local.
      </StateScreen>
    );
  }
  if (result.status === "unpublished") {
    return (
      <StateScreen icon={<Clock className="size-7" aria-hidden="true" />} title={`${result.data.business.name} todavía no publicó su carta`}>
        La carta de {result.data.branch.name} va a aparecer acá en cuanto la publiquen. Mientras tanto, consultá al personal.
      </StateScreen>
    );
  }
  // La hora de la solicitud define qué promociones se ven en el primer render;
  // después la página se actualiza sola cada minuto.
  return <PublicMenuClient data={result.data} serverNow={await requestTime()} />;
}

function StateScreen({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">{icon}</span>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-3 text-muted-foreground">{children}</p>
    </main>
  );
}

function PublicMenuSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" aria-busy="true">
      <span className="sr-only">Cargando la carta…</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/3" />
      <Skeleton className="mt-8 h-11 w-full" />
      <div className="mt-8 grid gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
