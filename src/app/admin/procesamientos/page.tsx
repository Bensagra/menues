import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Cpu, Filter } from "lucide-react";
import { RetryImportAdminButton } from "@/components/admin/admin-forms";
import { ADMIN_TZ } from "@/components/admin/admin-ui";
import { ADMIN_PAGE_SIZE, Pagination, paramValue, parsePage } from "@/components/admin/pagination";
import { RetriedNotice } from "@/components/admin/retried-notice";
import { NativeSelect } from "@/components/app/native-select";
import { PageHeader } from "@/components/app/page-header";
import { ImportStatusBadge } from "@/components/app/status";
import { EmptyState, PageSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/domain/time";
import { requirePlatformAdmin } from "@/server/admin";
import { requestTime } from "@/server/clock";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Procesamientos · Administración" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_FILTERS: Record<string, { label: string; statuses: string[] }> = {
  pending: { label: "En cola o procesando", statuses: ["pending", "processing"] },
  needs_review: { label: "Requieren revisión", statuses: ["needs_review"] },
  failed: { label: "Fallidos", statuses: ["failed"] },
  completed: { label: "Completados", statuses: ["completed"] },
  cancelled: { label: "Cancelados", statuses: ["cancelled"] },
};

const STAGE_LABEL: Record<string, string> = {
  queued: "En cola",
  preparing: "Preparando fotos",
  reading: "Leyendo la carta",
  comparing: "Comparando con la carta actual",
  ready: "Listo para revisar",
  applied: "Cambios aplicados",
  failed: "Falló",
  cancelled: "Cancelado",
  retry_wait: "Esperando para reintentar",
};

const SCOPE_LABEL: Record<string, string> = { full: "Carta completa", categories: "Categorías", prices_only: "Solo precios" };

export default function AdminImportsPage(props: PageProps<"/admin/procesamientos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Imports searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Imports({ searchParams }: { searchParams: PageProps<"/admin/procesamientos">["searchParams"] }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const sp = await searchParams;
  const estado = STATUS_FILTERS[paramValue(sp.estado)] ? paramValue(sp.estado) : "";
  const negocio = UUID.test(paramValue(sp.negocio)) ? paramValue(sp.negocio) : "";
  const page = parsePage(sp.pagina);

  let query = db
    .from("imports")
    .select(
      "id, business_id, status, stage, stage_page, scope, page_count, attempts, max_attempts, error_code, error_message, provider, model, created_at, updated_at, next_attempt_at, locked_by, locked_until, usage",
      { count: "exact" },
    )
    .neq("status", "uploading")
    .order("created_at", { ascending: false })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (estado) query = query.in("status", STATUS_FILTERS[estado].statuses);
  if (negocio) query = query.eq("business_id", negocio);
  const result = await query;
  const rows = unwrap(result, "procesamientos");
  const businessIds = [...new Set([...rows.map((r) => r.business_id), ...(negocio ? [negocio] : [])])];
  const { data: businesses } = businessIds.length ? await db.from("businesses").select("id, name, status").in("id", businessIds) : { data: [] };
  const businessById = new Map((businesses ?? []).map((b) => [b.id, b]));
  const filteredBusiness = negocio ? businessById.get(negocio) : null;
  const now = await requestTime();

  return (
    <>
      <PageHeader
        title="Procesamientos"
        description="Importaciones de fotos de todos los negocios. Reintentar es seguro: solo vuelve a encolar trabajos fallidos y reserva la cuota otra vez."
      />
      <RetriedNotice db={db} importId={paramValue(sp.reintentado)} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filtrar procesamientos">
        <div className="grid gap-1.5">
          <label htmlFor="estado-import" className="text-sm font-semibold">
            Estado
          </label>
          <NativeSelect id="estado-import" name="estado" defaultValue={estado} className="w-60">
            <option value="">Todos</option>
            {Object.entries(STATUS_FILTERS).map(([key, f]) => (
              <option key={key} value={key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {negocio && <input type="hidden" name="negocio" value={negocio} />}
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" /> Filtrar
        </Button>
        {filteredBusiness && (
          <p className="text-sm text-muted-foreground">
            Negocio: <strong className="text-foreground">{filteredBusiness.name}</strong> ·{" "}
            <Link href={estado ? `/admin/procesamientos?estado=${estado}` : "/admin/procesamientos"} className="font-semibold text-primary underline-offset-4 hover:underline">
              ver todos los negocios
            </Link>
          </p>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Cpu} title="No hay procesamientos con esos filtros" />
      ) : (
        <ul className="grid gap-3">
          {rows.map((imp) => {
            const business = businessById.get(imp.business_id);
            const retrying = imp.status === "pending" && imp.attempts > 0 && Boolean(imp.next_attempt_at && new Date(imp.next_attempt_at).getTime() > now);
            const usage = (imp.usage ?? {}) as { input_tokens?: number; output_tokens?: number; requests?: number };
            return (
              <li key={imp.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/negocios/${imp.business_id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                        {business?.name ?? "Negocio"}
                      </Link>
                      <ImportStatusBadge status={imp.status} retrying={retrying} />
                      {business?.status === "suspended" && <Badge variant="destructive">Cuenta suspendida</Badge>}
                      {imp.provider === "mock" && <Badge variant="destructive">Simulado</Badge>}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDateTime(imp.created_at, ADMIN_TZ)} · {SCOPE_LABEL[imp.scope] ?? imp.scope} · {imp.page_count} {imp.page_count === 1 ? "foto" : "fotos"} ·
                      intento {imp.attempts}/{imp.max_attempts}
                    </span>
                    <span className="text-muted-foreground">
                      Etapa: {STAGE_LABEL[imp.stage] ?? imp.stage}
                      {imp.stage === "reading" && imp.stage_page ? ` (foto ${imp.stage_page})` : ""}
                      {retrying && imp.next_attempt_at ? ` · próximo intento ${formatRelative(imp.next_attempt_at)}` : ""}
                      {imp.status === "processing" && imp.locked_by ? ` · worker ${imp.locked_by}` : ""}
                    </span>
                    {(imp.provider || usage.input_tokens) && (
                      <span className="text-muted-foreground">
                        {imp.provider ? `${imp.provider}${imp.model ? ` · ${imp.model}` : ""}` : ""}
                        {usage.input_tokens ? ` · ${usage.input_tokens.toLocaleString("es-AR")} / ${(usage.output_tokens ?? 0).toLocaleString("es-AR")} tokens` : ""}
                        {usage.requests ? ` · ${usage.requests} ${usage.requests === 1 ? "solicitud" : "solicitudes"}` : ""}
                      </span>
                    )}
                    {imp.error_code && (
                      <span className="font-medium text-error">
                        {imp.error_code}
                        {imp.error_message ? `: ${imp.error_message}` : ""}
                      </span>
                    )}
                  </div>
                  {imp.status === "failed" && <RetryImportAdminButton importId={imp.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath="/admin/procesamientos" params={{ estado, negocio }} page={page} total={result.count ?? 0} />
    </>
  );
}
