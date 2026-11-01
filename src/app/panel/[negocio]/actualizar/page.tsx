import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert, Settings2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ImportStatusBadge, SimulatedBadge } from "@/components/app/status";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { ImportUploader } from "@/components/imports/import-uploader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeSummary, type DiffSummary } from "@/domain/diff";
import { formatDateTime } from "@/domain/time";
import { serverEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { getAiAvailability } from "@/server/ai-availability";
import { getUploadData } from "@/server/queries/imports";

export const metadata: Metadata = { title: "Actualizar con foto" };

const SCOPE_LABEL: Record<string, string> = { full: "Carta completa", categories: "Categorías", prices_only: "Solo precios" };

export default function UpdateWithPhotoPage(props: PageProps<"/panel/[negocio]/actualizar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UpdateWithPhoto params={props.params} />
    </Suspense>
  );
}

async function UpdateWithPhoto({ params }: { params: PageProps<"/panel/[negocio]/actualizar">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["imports.create"]) return <RestrictedState backHref={base} />;
  const [data, ai] = await Promise.all([getUploadData(ctx), getAiAvailability()]);
  const tz = ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires";
  const quota = data.quota;

  return (
    <>
      <PageHeader
        title="Actualizar con una foto"
        description="Subí fotos de tu carta impresa. Detectamos precios, productos nuevos y cambios para que los revises antes de publicar."
      />

      {ctx.suspended ? (
        <Alert variant="destructive" className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>La cuenta está suspendida: no se pueden procesar fotos.</AlertDescription>
        </Alert>
      ) : !ai.available ? (
        <Alert variant="warning" className="mb-6">
          <Settings2 aria-hidden="true" />
          <AlertTitle>El procesamiento con IA necesita configuración</AlertTitle>
          <AlertDescription>
            Falta la clave de xAI (XAI_API_KEY) en el servidor o el procesador de fotos no está activo. Mientras tanto, podés{" "}
            <Link href={`${base}/menus`}>editar la carta a mano</Link>: la carta pública sigue funcionando normalmente.
          </AlertDescription>
        </Alert>
      ) : data.menus.length === 0 ? (
        <Alert variant="warning" className="mb-6">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            No hay cartas activas en tus sucursales. <Link href={`${base}/menus`}>Creá una carta</Link> para poder actualizarla con fotos.
          </AlertDescription>
        </Alert>
      ) : quota.remaining <= 0 ? (
        <Alert variant="warning" className="mb-6">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Llegaste al límite de fotos de este mes</AlertTitle>
          <AlertDescription>
            Tu plan {quota.plan_name} incluye {quota.limit} fotos procesadas por mes. Podés seguir editando la carta a mano o pedir un cambio de plan.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground" role="status">
            Te quedan <strong className="text-foreground">{quota.remaining}</strong> de {quota.limit} fotos este mes
            {quota.reserved > 0 ? ` (${quota.reserved} en proceso)` : ""}.
            {ai.simulated && " Modo de prueba: los resultados son simulados."}
          </p>
          {!ai.workerOnline && (
            <Alert variant="info" className="mb-4">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                El procesador de fotos no está respondiendo ahora. Si subís fotos, quedan en cola y se procesan apenas vuelva.
              </AlertDescription>
            </Alert>
          )}
          <ImportUploader
            base={base}
            menus={data.menus.filter((m) => m.branchIds.length > 0)}
            branches={ctx.branches.map((b) => ({ id: b.id, name: b.name }))}
            defaultBranchId={ctx.activeBranch?.id ?? null}
            maxPages={quota.max_pages_per_import}
            remaining={quota.remaining}
            maxBytes={serverEnv().imports.maxImageBytes}
          />
        </>
      )}

      {data.recent.length > 0 && (
        <section aria-labelledby="recientes" className="mt-10">
          <h2 id="recientes" className="mb-3 text-base font-bold">
            Actualizaciones recientes
          </h2>
          <ul className="grid gap-2">
            {data.recent.map((imp) => (
              <li key={imp.id}>
                <Link
                  href={`${base}/actualizar/${imp.id}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ImportStatusBadge status={imp.status} retrying={imp.stage === "retry_wait"} />
                    {imp.provider === "mock" && <SimulatedBadge />}
                    <span className="text-sm">
                      {(imp.menus as unknown as { name: string } | null)?.name} · {SCOPE_LABEL[imp.scope]} · {imp.page_count}{" "}
                      {imp.page_count === 1 ? "foto" : "fotos"}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {imp.status === "needs_review" || imp.status === "completed" ? `${describeSummary(imp.summary as unknown as DiffSummary)} · ` : ""}
                    {formatDateTime(imp.created_at, tz)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild variant="ghost" className="mt-2">
            <Link href={`${base}/historial?tipo=importaciones`}>Ver todo el historial</Link>
          </Button>
        </section>
      )}
    </>
  );
}
