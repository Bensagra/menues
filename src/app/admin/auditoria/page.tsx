import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filter, ScrollText } from "lucide-react";
import { ACTOR_KIND_LABEL, ADMIN_TZ } from "@/components/admin/admin-ui";
import { Pagination, paramValue, parsePage } from "@/components/admin/pagination";
import { NativeSelect } from "@/components/app/native-select";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, PageSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, zonedTimeToUtc } from "@/domain/time";
import { requirePlatformAdmin } from "@/server/admin";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Auditoría · Administración" };

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Grupos de acciones por prefijo (el código completo se ve en cada fila).
const GROUPS: Record<string, { label: string; prefixes: string[] }> = {
  plataforma: { label: "Plataforma", prefixes: ["platform."] },
  negocio: { label: "Negocio y sucursales", prefixes: ["business.", "branch."] },
  equipo: { label: "Equipo e invitaciones", prefixes: ["team."] },
  carta: { label: "Cartas y productos", prefixes: ["menu.", "category.", "product."] },
  importaciones: { label: "Importaciones", prefixes: ["import."] },
};

export default function AdminAuditPage(props: PageProps<"/admin/auditoria">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: PageProps<"/admin/auditoria">["searchParams"] }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const sp = await searchParams;
  const negocio = UUID.test(paramValue(sp.negocio)) ? paramValue(sp.negocio) : "";
  const grupo = GROUPS[paramValue(sp.grupo)] ? paramValue(sp.grupo) : "";
  const actor = ACTOR_KIND_LABEL[paramValue(sp.actor)] ? paramValue(sp.actor) : "";
  const desde = DATE.test(paramValue(sp.desde)) ? paramValue(sp.desde) : "";
  const hasta = DATE.test(paramValue(sp.hasta)) ? paramValue(sp.hasta) : "";
  const page = parsePage(sp.pagina);

  let query = db
    .from("audit_log")
    .select("id, business_id, branch_id, actor_id, actor_kind, action, entity_type, summary, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (negocio) query = query.eq("business_id", negocio);
  if (actor) query = query.eq("actor_kind", actor);
  if (grupo) query = query.or(GROUPS[grupo].prefixes.map((p) => `action.like.${p}*`).join(","));
  // Los días se interpretan en la hora de Argentina y se convierten a UTC.
  if (desde) query = query.gte("created_at", zonedTimeToUtc(desde, "00:00", ADMIN_TZ).toISOString());
  if (hasta) query = query.lt("created_at", new Date(zonedTimeToUtc(hasta, "00:00", ADMIN_TZ).getTime() + 86_400_000).toISOString());

  const result = await query;
  const rows = unwrap(result, "auditoría");
  const businessIds = [...new Set([...rows.map((r) => r.business_id), negocio].filter((v): v is string => Boolean(v)))];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))];
  const [businesses, profiles] = await Promise.all([
    businessIds.length ? db.from("businesses").select("id, name").in("id", businessIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    actorIds.length
      ? db.from("profiles").select("id, email, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; email: string; full_name: string }[] }),
  ]);
  const businessById = new Map((businesses.data ?? []).map((b) => [b.id, b.name]));
  const profileById = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const filtered = Boolean(negocio || grupo || actor || desde || hasta);

  return (
    <>
      <PageHeader title="Auditoría" description="Registro de solo inserción de acciones relevantes: nadie puede editarlo ni borrarlo desde la aplicación." />
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_auto] lg:items-end" aria-label="Filtrar auditoría">
        <div className="grid gap-1.5">
          <label htmlFor="audit-grupo" className="text-sm font-semibold">
            Tipo de acción
          </label>
          <NativeSelect id="audit-grupo" name="grupo" defaultValue={grupo}>
            <option value="">Todas</option>
            {Object.entries(GROUPS).map(([key, g]) => (
              <option key={key} value={key}>
                {g.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-actor" className="text-sm font-semibold">
            Quién
          </label>
          <NativeSelect id="audit-actor" name="actor" defaultValue={actor}>
            <option value="">Todos</option>
            {Object.entries(ACTOR_KIND_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-desde" className="text-sm font-semibold">
            Desde
          </label>
          <Input id="audit-desde" name="desde" type="date" defaultValue={desde} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="audit-hasta" className="text-sm font-semibold">
            Hasta
          </label>
          <Input id="audit-hasta" name="hasta" type="date" defaultValue={hasta} />
        </div>
        {negocio && <input type="hidden" name="negocio" value={negocio} />}
        <Button type="submit" variant="outline">
          <Filter aria-hidden="true" /> Filtrar
        </Button>
      </form>
      {negocio && (
        <p className="mb-4 text-sm text-muted-foreground">
          Negocio: <strong className="text-foreground">{businessById.get(negocio) ?? "desconocido"}</strong> ·{" "}
          <Link href="/admin/auditoria" className="font-semibold text-primary underline-offset-4 hover:underline">
            ver todos los negocios
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? "No hay registros con esos filtros" : "Todavía no hay registros"} />
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => {
            const person = row.actor_id ? profileById.get(row.actor_id) : null;
            const details = row.details && typeof row.details === "object" && Object.keys(row.details).length > 0 ? row.details : null;
            return (
              <li key={row.id} className="border-b border-border px-4 py-3 text-sm last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span>
                    <span className="font-semibold">{person?.full_name || person?.email || ACTOR_KIND_LABEL[row.actor_kind]}</span>
                    {row.actor_kind !== "user" && person && <span className="text-muted-foreground"> ({ACTOR_KIND_LABEL[row.actor_kind]})</span>}
                    {row.business_id && (
                      <>
                        {" · "}
                        <Link href={`/admin/negocios/${row.business_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {businessById.get(row.business_id) ?? "Negocio"}
                        </Link>
                      </>
                    )}
                  </span>
                  <time dateTime={row.created_at} className="text-muted-foreground tabular-nums">
                    {formatDateTime(row.created_at, ADMIN_TZ)}
                  </time>
                </div>
                <p className="mt-0.5">{row.summary || row.action}</p>
                <p className="font-mono text-[12px] text-muted-foreground">{row.action}</p>
                {details && (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-primary">Ver detalle</summary>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-[#f4f2ec] p-3 text-[12px]">{JSON.stringify(details, null, 2)}</pre>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Pagination basePath="/admin/auditoria" params={{ negocio, grupo, actor, desde, hasta }} page={page} total={result.count ?? 0} pageSize={PAGE_SIZE} />
    </>
  );
}
