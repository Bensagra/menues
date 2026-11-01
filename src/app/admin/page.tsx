import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OctagonAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRelative } from "@/domain/time";
import { requirePlatformAdmin } from "@/server/admin";
import { requestTime } from "@/server/clock";

export const metadata: Metadata = { title: "Administración" };

const TZ = "America/Argentina/Buenos_Aires";

function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "warning" }) {
  const content = (
    <div className={`rounded-xl border p-4 ${tone === "warning" ? "border-warning/30 bg-warning-surface" : "border-border bg-card"}`}>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl hover:opacity-90">
      {content}
    </Link>
  ) : (
    content
  );
}

export default function AdminHome() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const now = await requestTime();
  const since = new Date(now - 7 * 86400000).toISOString();
  const [businesses, suspended, users, failed, pending, review, workers, audit] = await Promise.all([
    db.from("businesses").select("id", { count: "exact", head: true }),
    db.from("businesses").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("imports").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
    db.from("imports").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    db.from("imports").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
    db.from("worker_heartbeats").select("*").order("last_seen_at", { ascending: false }).limit(5),
    db.from("audit_log").select("id, action, summary, created_at, actor_kind, business_id, businesses(name)").order("created_at", { ascending: false }).limit(12),
  ]);
  const onlineWorkers = (workers.data ?? []).filter((w) => now - new Date(w.last_seen_at).getTime() < 90_000);

  return (
    <>
      <PageHeader title="Resumen" description="Estado general de la plataforma." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Negocios" value={businesses.count ?? 0} href="/admin/negocios" />
        <Stat label="Cuentas suspendidas" value={suspended.count ?? 0} href="/admin/negocios?estado=suspended" />
        <Stat label="Usuarios" value={users.count ?? 0} href="/admin/usuarios" />
        <Stat label="Importaciones fallidas (7 días)" value={failed.count ?? 0} href="/admin/procesamientos?estado=failed" tone={(failed.count ?? 0) > 0 ? "warning" : undefined} />
        <Stat label="En cola o procesando" value={pending.count ?? 0} href="/admin/procesamientos?estado=pending" />
        <Stat label="Esperando revisión" value={review.count ?? 0} href="/admin/procesamientos?estado=needs_review" />
      </div>

      <section aria-labelledby="workers" className="mt-8">
        <h2 id="workers" className="mb-3 text-base font-bold">
          Procesador de fotos
        </h2>
        {onlineWorkers.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-surface p-4 text-sm text-warning">
            <OctagonAlert className="size-4" aria-hidden="true" /> No hay workers activos. Las importaciones quedan en cola hasta que se inicie uno (npm run worker).
          </p>
        ) : (
          <ul className="grid gap-2">
            {onlineWorkers.map((w) => (
              <li key={w.worker_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <span className="font-mono">{w.worker_id}</span>
                <span className="flex items-center gap-2">
                  {w.provider === "mock" ? <Badge variant="destructive">Simulado</Badge> : <Badge variant="success">{w.provider}</Badge>}
                  {w.model && <span className="text-muted-foreground">{w.model}</span>}
                  {!w.ai_configured && <Badge variant="warning">IA sin configurar</Badge>}
                  <span className="text-muted-foreground">latido {formatRelative(w.last_seen_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="actividad" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="actividad" className="text-base font-bold">
            Actividad reciente
          </h2>
          <Link href="/admin/auditoria" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Ver auditoría
          </Link>
        </div>
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {(audit.data ?? []).map((entry) => (
            <li key={entry.id} className="border-b border-border px-4 py-3 text-sm last:border-0">
              <span className="text-muted-foreground">{formatDateTime(entry.created_at, TZ)} · </span>
              {(entry.businesses as unknown as { name: string } | null)?.name && (
                <strong>{(entry.businesses as unknown as { name: string }).name}: </strong>
              )}
              {entry.summary || entry.action}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
