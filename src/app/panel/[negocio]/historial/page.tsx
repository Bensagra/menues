import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Camera, History, PencilLine, RotateCcw, Tags } from "lucide-react";
import { NativeSelect } from "@/components/app/native-select";
import { PageHeader } from "@/components/app/page-header";
import { ImportStatusBadge, SimulatedBadge } from "@/components/app/status";
import { EmptyState, PageSkeleton, RestrictedState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeSummary, type DiffSummary } from "@/domain/diff";
import { plural } from "@/domain/text";
import { formatDateTime } from "@/domain/time";
import { getBusinessContext } from "@/server/auth";
import { listHistory } from "@/server/queries/history";

export const metadata: Metadata = { title: "Historial" };

type Props = PageProps<"/panel/[negocio]/historial">;

const SOURCE: Record<string, { label: string; icon: typeof Camera }> = {
  manual: { label: "Edición manual", icon: PencilLine },
  import: { label: "Actualización con foto", icon: Camera },
  restore: { label: "Restauración", icon: RotateCcw },
  bulk_price: { label: "Precios masivos", icon: Tags },
  photo: { label: "Foto", icon: Camera },
};

function versionSummary(summary: Record<string, unknown>): string {
  const n = (key: string) => Number(summary[key] ?? 0);
  if (summary.first) return `Primera publicación · ${plural(n("products"), "producto", "productos")}`;
  const parts = [
    n("price_changed") && `${n("price_changed")} con cambio de precio`,
    n("added") && `${n("added")} ${n("added") === 1 ? "nuevo" : "nuevos"}`,
    n("removed") && `${n("removed")} sin mostrar`,
    n("availability_changed") && `${n("availability_changed")} con cambio de disponibilidad`,
    n("details_changed") && `${n("details_changed")} con otros cambios`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin cambios de productos";
}

export default function HistoryPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <HistoryContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function HistoryContent({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const { negocio } = await params;
  const sp = await searchParams;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["history.view"]) return <RestrictedState backHref={base} />;
  const type = sp.tipo === "publicaciones" || sp.tipo === "importaciones" ? sp.tipo : "todo";
  const branchId = typeof sp.sucursal === "string" && ctx.branches.some((b) => b.id === sp.sucursal) ? sp.sucursal : null;
  const before = typeof sp.antes === "string" ? sp.antes : null;
  const { entries, nextBefore } = await listHistory(ctx, { type, branchId, before });
  const branchName = new Map(ctx.branches.map((b) => [b.id, b]));
  const query = (extra: Record<string, string | null>) => {
    const qs = new URLSearchParams();
    const values = { tipo: type === "todo" ? null : type, sucursal: branchId, ...extra };
    for (const [k, v] of Object.entries(values)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader title="Historial" description="Publicaciones e importaciones. Restaurar una versión crea una publicación nueva: nunca se borra el historial." />
      <form className="mb-5 flex flex-wrap items-end gap-3" action={`${base}/historial`}>
        <label className="grid gap-1.5 text-sm font-semibold">
          Mostrar
          <NativeSelect name="tipo" defaultValue={type === "todo" ? "" : type} className="w-56">
            <option value="">Todo</option>
            <option value="publicaciones">Publicaciones</option>
            <option value="importaciones">Importaciones con foto</option>
          </NativeSelect>
        </label>
        {ctx.branches.length > 1 && (
          <label className="grid gap-1.5 text-sm font-semibold">
            Sucursal
            <NativeSelect name="sucursal" defaultValue={branchId ?? ""} className="w-56">
              <option value="">Todas</option>
              {ctx.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState icon={History} title="Todavía no hay movimientos" description="Cuando publiques o actualices con fotos, vas a ver acá quién hizo cada cambio y cuándo." />
      ) : (
        <ol className="grid gap-3">
          {entries.map((entry) => {
            const meta = SOURCE[entry.type === "import" ? "photo" : entry.source] ?? SOURCE.manual;
            const Icon = meta.icon;
            const tz = branchName.get(entry.branchIds[0])?.timezone ?? ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires";
            return (
              <li key={`${entry.type}-${entry.id}`} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="font-semibold text-foreground">{entry.type === "import" ? "Importación con foto" : `Publicación · ${meta.label}`}</span>
                      <span>· {formatDateTime(entry.at, tz)}</span>
                      {entry.userName && <span>· {entry.userName}</span>}
                    </p>
                    <h2 className="mt-1 font-bold">{entry.menuName}</h2>
                  </div>
                  {entry.type === "import" ? (
                    <span className="flex items-center gap-2">
                      {entry.provider === "mock" && <SimulatedBadge />}
                      <ImportStatusBadge status={entry.status} />
                    </span>
                  ) : (
                    <Badge variant="success">Publicada</Badge>
                  )}
                </div>

                {entry.type === "publication" ? (
                  <ul className="mt-3 grid gap-2">
                    {entry.versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background px-3 py-2">
                        <span className="text-sm">
                          <strong>{branchName.get(v.branchId)?.name ?? "Sucursal"}</strong> · versión {v.versionNumber}
                          {v.current && (
                            <Badge variant="secondary" className="ml-2">
                              Vigente
                            </Badge>
                          )}
                          <span className="block text-muted-foreground">{versionSummary(v.summary)}</span>
                        </span>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`${base}/historial/version/${v.id}`}>Comparar{!v.current && ctx.permissions["history.restore"] ? " o restaurar" : ""}</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {entry.branchIds.map((id) => branchName.get(id)?.name).filter(Boolean).join(", ")} · {entry.pageCount}{" "}
                      {entry.pageCount === 1 ? "foto" : "fotos"}
                      {(entry.status === "needs_review" || entry.status === "completed") && entry.importSummary
                        ? ` · ${describeSummary(entry.importSummary as unknown as DiffSummary)}`
                        : ""}
                    </span>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`${base}/actualizar/${entry.id}`}>Ver detalle</Link>
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {nextBefore && (
        <div className="mt-5">
          <Button asChild variant="outline">
            <Link href={`${base}/historial${query({ antes: nextBefore })}`}>Ver movimientos anteriores</Link>
          </Button>
        </div>
      )}
    </>
  );
}
