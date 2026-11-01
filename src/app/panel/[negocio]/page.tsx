import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, BookOpen, Camera, CircleCheck, Circle, Loader2, Palette, PencilLine, QrCode, Settings2, Sparkles, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ImportStatusBadge, PublishStateBadge } from "@/components/app/status";
import { PageSkeleton } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/time";
import { describeSummary, type DiffSummary } from "@/domain/diff";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { getAiAvailability } from "@/server/ai-availability";
import { getHomeData } from "@/server/queries/home";
import { publicMenuUrl } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Inicio" };

export default function HomePage(props: PageProps<"/panel/[negocio]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Home params={props.params} />
    </Suspense>
  );
}

async function Home({ params }: { params: PageProps<"/panel/[negocio]">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const [data, ai, design] = await Promise.all([getHomeData(ctx), getAiAvailability(), getDesignState(ctx)]);
  const base = `/panel/${ctx.business.slug}`;
  const branch = ctx.activeBranch;
  const tz = branch?.timezone ?? "America/Argentina/Buenos_Aires";
  const publicUrl = branch ? publicMenuUrl(publicEnv().appUrl, branch.public_slug) : null;
  const firstMenu = data.menus[0];
  const pendingMenus = data.menus.filter((m) => m.hasChanges);
  const reviewImports = data.imports.filter((i) => i.status === "needs_review");

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Inicio"
        description={
          <>
            {ctx.business.name}
            {branch ? ` · ${branch.name}` : ""}
          </>
        }
      />

      {!branch && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>No tenés sucursales asignadas. Pedile acceso a quien administra el negocio.</AlertDescription>
        </Alert>
      )}

      {/* Acción principal */}
      {ctx.permissions["imports.create"] && (
        <section aria-labelledby="actualizar-foto" className="rounded-xl bg-primary p-5 text-primary-foreground sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="actualizar-foto" className="font-display text-2xl font-semibold">
                Actualizar con una foto
              </h2>
              <p className="mt-1 text-sm text-white/85">
                {ai.available
                  ? "Sacale una foto a tu carta impresa: detectamos precios y productos nuevos para que los revises."
                  : "El procesamiento con IA todavía no está configurado. Podés editar la carta a mano."}
              </p>
            </div>
            {ai.available ? (
              <Button asChild size="lg" className="bg-white text-primary hover:bg-[#e8f0e9]">
                <Link href={`${base}/actualizar`}>
                  <Camera aria-hidden="true" /> Subir fotos
                </Link>
              </Button>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold">
                <Settings2 className="size-4" aria-hidden="true" /> Necesita configuración
              </span>
            )}
          </div>
        </section>
      )}

      {design && (
        <section aria-labelledby="diseno-carta" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            {design === "processing" ? (
              <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
            ) : design === "ready" ? (
              <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Palette className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            )}
            <div>
              <h2 id="diseno-carta" className="font-bold">
                {design === "ready"
                  ? "Te armamos un diseño a medida para tu carta"
                  : design === "processing"
                    ? "Estamos armando un diseño a medida para tu carta"
                    : "Dale a tu carta la cara de tu local"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {design === "none"
                  ? "Te proponemos colores, letras y estilo a partir de tu logo, tus fotos y tu sitio web."
                  : "Con los colores y la letra de tu local. Miralo en la vista previa y aplicalo si te gusta."}
              </p>
            </div>
          </div>
          <Button asChild variant={design === "ready" ? "default" : "outline"} className="shrink-0">
            <Link href={`${base}/diseno`}>{design === "ready" ? "Ver propuesta" : design === "processing" ? "Ver estado" : "Armar mi diseño"}</Link>
          </Button>
        </section>
      )}

      {/* Estado inicial guiado (sin métricas inventadas) */}
      {!data.hasPublished && (
        <section aria-labelledby="primeros-pasos" className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 id="primeros-pasos" className="text-lg font-bold">
            Primeros pasos
          </h2>
          <ol className="mt-4 grid gap-3">
            {[
              { done: data.hasProducts, label: "Cargá tu carta", hint: "Con fotos o a mano.", href: firstMenu ? `${base}/menus/${firstMenu.menuId}` : `${base}/menus` },
              { done: data.hasPublished, label: "Publicala", hint: "Tus clientes ven solo lo publicado.", href: firstMenu ? `${base}/menus/${firstMenu.menuId}` : `${base}/menus` },
              { done: false, label: "Compartí el QR", hint: "Imprimilo para las mesas o compartí el enlace.", href: `${base}/qr` },
            ].map((step) => (
              <li key={step.label}>
                <Link href={step.href} className="flex min-h-14 items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-secondary">
                  {step.done ? (
                    <CircleCheck className="size-5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span>
                    <span className="block font-semibold">
                      {step.label}
                      <span className="sr-only">{step.done ? " (hecho)" : " (pendiente)"}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">{step.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Estado de las cartas en la sucursal activa */}
      <section aria-labelledby="estado-cartas">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="estado-cartas" className="text-base font-bold">
            {branch ? `Cartas en ${branch.name}` : "Cartas"}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={`${base}/menus`}>Ver todas</Link>
          </Button>
        </div>
        {data.menus.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-6 text-sm text-muted-foreground">
            Esta sucursal todavía no tiene cartas asignadas.{" "}
            {ctx.permissions["menus.manage"] && (
              <Link href={`${base}/menus`} className="font-semibold text-primary underline underline-offset-4">
                Creá una carta
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-3">
            {data.menus.map((menu) => (
              <li key={menu.menuId} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{menu.name}</h3>
                      <PublishStateBadge state={menu.versionNumber === null ? "unpublished" : menu.hasChanges ? "changes" : "published"} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {menu.versionNumber !== null && menu.publishedAt
                        ? `Última publicación: ${formatDateTime(menu.publishedAt, tz)}${menu.publishedBy ? ` por ${menu.publishedBy}` : ""} · versión ${menu.versionNumber}`
                        : "Todavía no se publicó."}{" "}
                      · {menu.draftProductCount} {menu.draftProductCount === 1 ? "producto visible" : "productos visibles"} en el borrador
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant={menu.hasChanges ? "default" : "outline"}>
                      <Link href={`${base}/menus/${menu.menuId}`}>
                        <PencilLine aria-hidden="true" /> {menu.hasChanges && ctx.permissions["catalog.publish"] ? "Revisar y publicar" : "Editar"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pendingMenus.length > 0 && (
          <p className="mt-3 text-sm text-warning" role="status">
            {pendingMenus.length === 1 ? "Hay 1 carta con cambios sin publicar." : `Hay ${pendingMenus.length} cartas con cambios sin publicar.`} Tus
            clientes siguen viendo la versión publicada.
          </p>
        )}
      </section>

      {/* Importaciones activas */}
      {data.imports.length > 0 && (
        <section aria-labelledby="importaciones">
          <h2 id="importaciones" className="mb-3 text-base font-bold">
            Actualizaciones con foto
          </h2>
          <ul className="grid gap-2">
            {data.imports.map((imp) => (
              <li key={imp.id}>
                <Link
                  href={`${base}/actualizar/${imp.id}`}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ImportStatusBadge status={imp.status} retrying={imp.stage === "retry_wait"} />
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(imp.created_at, tz)} · {imp.page_count} {imp.page_count === 1 ? "foto" : "fotos"}
                    </span>
                  </span>
                  {imp.status === "needs_review" && (
                    <span className="text-sm font-semibold text-primary">
                      {describeSummary(imp.summary as unknown as DiffSummary)} · Revisar
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {reviewImports.length > 0 && (
            <p className="sr-only">{reviewImports.length === 1 ? "1 importación espera revisión." : `${reviewImports.length} importaciones esperan revisión.`}</p>
          )}
        </section>
      )}

      {/* Accesos rápidos */}
      <section aria-labelledby="accesos">
        <h2 id="accesos" className="mb-3 text-base font-bold">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickLink href={firstMenu ? `${base}/menus/${firstMenu.menuId}` : `${base}/menus`} icon={BookOpen} label="Editar carta" />
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener"
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 font-semibold hover:bg-secondary"
            >
              <span className="flex items-center gap-3">
                <ArrowUpRight className="size-5 text-primary" aria-hidden="true" /> Ver carta pública
              </span>
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          ) : null}
          <QuickLink href={`${base}/qr`} icon={QrCode} label="Descargar QR" />
        </div>
      </section>

    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof BookOpen; label: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 font-semibold hover:bg-secondary">
      <Icon className="size-5 text-primary" aria-hidden="true" />
      {label}
    </Link>
  );
}

/** Aviso del diseño a medida: propuesta lista, en curso o sin diseño propio todavía. */
async function getDesignState(ctx: Awaited<ReturnType<typeof getBusinessContext>>): Promise<"ready" | "processing" | "none" | null> {
  if (!ctx.permissions["business.update"]) return null;
  const supabase = await createClient();
  const [{ data: business }, { data: request }] = await Promise.all([
    supabase.from("businesses").select("theme").eq("id", ctx.business.id).single(),
    supabase.from("design_requests").select("status").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (request?.status === "ready") return "ready";
  if (request?.status === "pending" || request?.status === "processing") return "processing";
  if (!business?.theme && !request) return "none";
  return null;
}
