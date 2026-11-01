import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { RestoreVersionButton } from "@/components/history/restore-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { diffSnapshots, parseSnapshot } from "@/domain/snapshot";
import { formatDateTime } from "@/domain/time";
import { getBusinessContext } from "@/server/auth";
import { getVersionDetail } from "@/server/queries/history";

export const metadata: Metadata = { title: "Comparar versiones" };

type Props = PageProps<"/panel/[negocio]/historial/version/[versionId]">;

const FIELD: Record<string, string> = {
  price: "Precio",
  status: "Disponibilidad",
  name: "Nombre",
  description: "Descripción",
  variants: "Variantes",
  extras: "Extras",
  tags: "Etiquetas",
  image: "Foto",
  category: "Categoría",
};

const SOURCE: Record<string, string> = { manual: "Edición manual", import: "Actualización con foto", restore: "Restauración", bulk_price: "Precios masivos" };

export default function VersionPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <VersionContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function VersionContent({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const { negocio, versionId } = await params;
  const sp = await searchParams;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["history.view"]) return <RestrictedState backHref={base} />;
  const detail = await getVersionDetail(ctx, versionId, typeof sp.con === "string" ? sp.con : null);
  const { version } = detail;
  const branch = ctx.branches.find((b) => b.id === version.branch_id);
  const tz = branch?.timezone ?? "America/Argentina/Buenos_Aires";
  const snapshot = parseSnapshot(version.snapshot);
  const fmt = (minor: number | null) => (minor === null ? "" : formatMoney(minor, snapshot.currency, ctx.business.locale));
  const entries = diffSnapshots(detail.other ? parseSnapshot(detail.other.snapshot) : null, snapshot, fmt);

  return (
    <>
      <PageHeader
        back={{ href: `${base}/historial`, label: "Historial" }}
        title={`Versión ${version.version_number} · ${detail.menuName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {branch?.name} · {SOURCE[detail.publication.source] ?? "Publicación"} · {formatDateTime(detail.publication.published_at, tz)}
              {detail.publishedByName ? ` · ${detail.publishedByName}` : ""} · {version.product_count} productos
            </span>
            {detail.isCurrent && <Badge variant="success">Vigente</Badge>}
          </span>
        }
        actions={
          !detail.isCurrent && ctx.permissions["history.restore"] && !ctx.suspended ? (
            <RestoreVersionButton
              versionId={version.id}
              versionNumber={version.version_number}
              currentVersionNumber={detail.currentVersionNumber}
              branchName={branch?.name ?? "la sucursal"}
              menuName={detail.menuName}
              sharedMenu={detail.menuBranchCount > 1}
              canRestoreDraft={ctx.permissions["catalog.edit"]}
            />
          ) : undefined
        }
      />

      <form className="mb-5 flex flex-wrap items-end gap-3" action={`${base}/historial/version/${version.id}`}>
        <label className="grid gap-1.5 text-sm font-semibold">
          Comparar con
          <select
            name="con"
            defaultValue={detail.other?.id ?? ""}
            className="h-11 w-64 rounded-lg border border-input bg-card px-3 text-base font-normal"
          >
            {detail.siblings
              .filter((s) => s.id !== version.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  Versión {s.version_number} · {formatDateTime(s.created_at, tz)}
                </option>
              ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Comparar
        </Button>
      </form>

      <section aria-labelledby="diferencias" className="rounded-xl border border-border bg-card p-5">
        <h2 id="diferencias" className="mb-3 font-bold">
          {detail.other ? `Cambios desde la versión ${detail.other.version_number}` : "Primera versión publicada"}
        </h2>
        {!detail.other ? (
          <p className="text-sm text-muted-foreground">No hay una versión anterior para comparar en esta sucursal.</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Las dos versiones tienen el mismo contenido.</p>
        ) : (
          <ul className="grid gap-3">
            {entries.map((entry) => (
              <li key={entry.productId} className="rounded-lg border border-border p-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {entry.type === "added" && (
                    <Badge variant="success">
                      <Plus aria-hidden="true" /> Nuevo
                    </Badge>
                  )}
                  {entry.type === "removed" && (
                    <Badge variant="warning">
                      <Minus aria-hidden="true" /> Ya no se muestra
                    </Badge>
                  )}
                  {entry.name} <span className="text-sm font-normal text-muted-foreground">· {entry.category}</span>
                </p>
                {entry.changes.length > 0 && (
                  <dl className="mt-2 grid gap-1 text-sm">
                    {entry.changes.map((c) => (
                      <div key={c.field} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                        <dt className="text-muted-foreground">{FIELD[c.field]}</dt>
                        <dd className="price flex flex-wrap items-center gap-2 whitespace-normal">
                          <span className="text-muted-foreground line-through decoration-1">{c.before}</span>
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                          <span className="font-medium">{c.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-sm text-muted-foreground">
        <Link href={`${base}/menus/${version.menu_id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
          Ir al editor de la carta
        </Link>
      </p>
    </>
  );
}
