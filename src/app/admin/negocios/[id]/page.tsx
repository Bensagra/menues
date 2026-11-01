import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink, PauseCircle } from "lucide-react";
import { ACTOR_KIND_LABEL, ADMIN_TZ, BusinessStatusBadge, currentMonthKey } from "@/components/admin/admin-ui";
import { AssignPlanForm, BusinessStatusControl, InviteOwnerForm, RetryImportAdminButton } from "@/components/admin/admin-forms";
import { paramValue } from "@/components/admin/pagination";
import { RetriedNotice } from "@/components/admin/retried-notice";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ImportStatusBadge } from "@/components/app/status";
import { PageSkeleton } from "@/components/app/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { formatDate, formatDateTime } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { requirePlatformAdmin } from "@/server/admin";
import { requestTime } from "@/server/clock";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Detalle de negocio · Administración" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPE_LABEL: Record<string, string> = { full: "Carta completa", categories: "Categorías", prices_only: "Solo precios" };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</section>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default function AdminBusinessPage(props: PageProps<"/admin/negocios/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BusinessDetail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function BusinessDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/negocios/[id]">["params"];
  searchParams: PageProps<"/admin/negocios/[id]">["searchParams"];
}) {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const { data: business, error } = await db.from("businesses").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar: negocio");
  if (!business) notFound();

  const [branches, menuBranches, memberships, invitations, assignments, plans, usage, imports, audit] = await Promise.all([
    db.from("branches").select("id, name, public_slug, timezone, is_active, created_at").eq("business_id", id).order("sort_order").order("name"),
    db.from("menu_branches").select("branch_id, published_version_id").eq("business_id", id),
    db.from("memberships").select("id, user_id, role, can_publish, all_branches, created_at").eq("business_id", id).eq("status", "active").order("created_at"),
    db
      .from("invitations")
      .select("id, email, role, expires_at, created_at, created_by_platform")
      .eq("business_id", id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    db
      .from("plan_assignments")
      .select("id, plan_id, starts_at, ends_at, note, assigned_by, plans(name, ai_pages_per_month, ai_max_pages_per_import, max_branches, max_members, max_menus)")
      .eq("business_id", id)
      .order("starts_at", { ascending: false })
      .limit(8),
    db.from("plans").select("id, name").eq("is_active", true).order("ai_pages_per_month"),
    db.from("ai_usage_months").select("*").eq("business_id", id).order("month", { ascending: false }).limit(6),
    db
      .from("imports")
      .select("id, status, stage, scope, page_count, attempts, max_attempts, error_code, error_message, provider, model, created_at, next_attempt_at")
      .eq("business_id", id)
      .neq("status", "uploading")
      .order("created_at", { ascending: false })
      .limit(15),
    db.from("audit_log").select("id, action, summary, created_at, actor_kind, actor_id").eq("business_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  const branchRows = unwrap(branches, "sucursales");
  const memberRows = unwrap(memberships, "equipo");
  const auditRows = unwrap(audit, "actividad");
  const assignmentRows = unwrap(assignments, "planes asignados");
  const usageRows = unwrap(usage, "consumo");
  const importRows = unwrap(imports, "importaciones");
  const userIds = [...memberRows.map((m) => m.user_id), ...auditRows.map((a) => a.actor_id), ...assignmentRows.map((a) => a.assigned_by)].filter(
    (v): v is string => Boolean(v),
  );
  const { data: profiles } = userIds.length ? await db.from("profiles").select("id, email, full_name").in("id", [...new Set(userIds)]) : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const published = new Set((menuBranches.data ?? []).filter((mb) => mb.published_version_id).map((mb) => mb.branch_id));

  type PlanInfo = { name: string; ai_pages_per_month: number; ai_max_pages_per_import: number; max_branches: number; max_members: number; max_menus: number };
  const current = assignmentRows.find((a) => !a.ends_at);
  const currentPlan = (current?.plans ?? null) as unknown as PlanInfo | null;
  const thisMonth = usageRows.find((u) => u.month === currentMonthKey());
  const appUrl = publicEnv().appUrl;
  const now = await requestTime();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/negocios", label: "Negocios" }}
        title={business.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BusinessStatusBadge status={business.status} />
            <span>
              {business.slug} · {business.currency} · alta el {formatDate(business.created_at, ADMIN_TZ)}
            </span>
          </span>
        }
        actions={<BusinessStatusControl businessId={business.id} businessName={business.name} status={business.status as "active" | "suspended"} />}
      />

      <RetriedNotice db={db} importId={paramValue(sp.reintentado)} />

      {business.status === "suspended" && (
        <Alert variant="destructive" className="mb-6">
          <PauseCircle aria-hidden="true" />
          <AlertTitle>Cuenta suspendida {business.suspended_at ? `desde el ${formatDateTime(business.suspended_at, ADMIN_TZ)}` : ""}</AlertTitle>
          <AlertDescription>
            Motivo: {business.suspended_reason || "sin motivo registrado"}. La carta pública muestra «Esta carta no está disponible», el equipo
            tiene acceso de solo lectura y las importaciones en cola esperan. No se borró ningún dato.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionTitle description="Asignación manual: no hay cobros automáticos.">Plan y consumo</SectionTitle>
          {currentPlan ? (
            <dl className="mb-4">
              <Fact label="Plan actual">{currentPlan.name}</Fact>
              <Fact label="Fotos procesadas este mes">
                <span className="tabular-nums">
                  {thisMonth?.pages_used ?? 0} usadas · {thisMonth?.pages_reserved ?? 0} en curso · límite {currentPlan.ai_pages_per_month}
                </span>
              </Fact>
              <Fact label="Fotos por importación">{currentPlan.ai_max_pages_per_import}</Fact>
              <Fact label="Sucursales">
                <span className="tabular-nums">
                  {branchRows.filter((b) => b.is_active).length} de {currentPlan.max_branches}
                </span>
              </Fact>
              <Fact label="Personas">
                <span className="tabular-nums">
                  {memberRows.length} de {currentPlan.max_members}
                </span>
              </Fact>
              <Fact label="Cartas activas">hasta {currentPlan.max_menus}</Fact>
            </dl>
          ) : (
            <p className="mb-4 text-sm text-warning">Este negocio no tiene un plan vigente.</p>
          )}
          <AssignPlanForm businessId={business.id} plans={unwrap(plans, "planes")} currentPlanId={current?.plan_id ?? null} />
          {usageRows.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold">Consumo de los últimos meses</h3>
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 font-semibold">
                      Mes
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Fotos
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Completadas
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Fallidas
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      Tokens (entrada/salida)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((u) => (
                    <tr key={u.month} className="border-t border-border">
                      <td className="py-1.5">{u.month.slice(0, 7)}</td>
                      <td className="py-1.5 text-right">{u.pages_used}</td>
                      <td className="py-1.5 text-right">{u.imports_completed}</td>
                      <td className="py-1.5 text-right">{u.imports_failed}</td>
                      <td className="py-1.5 text-right">
                        {u.input_tokens.toLocaleString("es-AR")} / {u.output_tokens.toLocaleString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assignmentRows.length > 1 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold">Historial de planes</h3>
              <ul className="grid gap-1 text-sm">
                {assignmentRows.map((a) => (
                  <li key={a.id} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{(a.plans as unknown as PlanInfo | null)?.name}</span> desde el{" "}
                    {formatDate(a.starts_at, ADMIN_TZ)}
                    {a.ends_at ? ` hasta el ${formatDate(a.ends_at, ADMIN_TZ)}` : " (vigente)"}
                    {a.note ? ` · ${a.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Sucursales</SectionTitle>
          <ul className="grid gap-2">
            {branchRows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{b.name}</span>
                  <span className="block text-muted-foreground">{b.timezone.replace(/_/g, " ")}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {!b.is_active && <Badge variant="muted">Inactiva</Badge>}
                  {published.has(b.id) ? <Badge variant="success">Con carta publicada</Badge> : <Badge variant="muted">Sin publicar</Badge>}
                  <a
                    href={`${appUrl}/m/${b.public_slug}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    /m/{b.public_slug} <ExternalLink className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">(se abre en otra pestaña)</span>
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle description="La plataforma no entra a las cuentas: para dar soporte, el negocio invita a alguien con su propio usuario.">
            Equipo
          </SectionTitle>
          <ul className="mb-4 grid gap-2">
            {memberRows.map((m) => {
              const p = profileById.get(m.user_id);
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0">
                  <span>
                    <span className="font-semibold">{p?.full_name || p?.email || "Usuario"}</span>
                    <span className="block text-muted-foreground">{p?.email}</span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{ROLE_LABELS[m.role as Role] ?? m.role}</Badge>
                    {m.role === "editor" && (m.can_publish ? <Badge variant="outline">Puede publicar</Badge> : <Badge variant="muted">No publica</Badge>)}
                  </span>
                </li>
              );
            })}
            {memberRows.length === 0 && <li className="text-sm text-warning">Todavía nadie aceptó la invitación de propietario.</li>}
          </ul>
          {(invitations.data ?? []).length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-bold">Invitaciones abiertas</h3>
              <ul className="grid gap-1 text-sm">
                {(invitations.data ?? []).map((i) => {
                  const expired = new Date(i.expires_at).getTime() <= now;
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.email}</span>
                      <Badge variant="outline">{ROLE_LABELS[i.role as Role] ?? i.role}</Badge>
                      {expired ? (
                        <Badge variant="warning">Vencida</Badge>
                      ) : (
                        <span className="text-muted-foreground">vence el {formatDate(i.expires_at, ADMIN_TZ)}</span>
                      )}
                      {i.created_by_platform && <span className="text-muted-foreground">· creada por la plataforma</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <InviteOwnerForm businessId={business.id} />
        </Card>

        <Card>
          <SectionTitle
            description="Las importaciones fallidas no afectan la carta publicada."
            action={
              <Link href={`/admin/procesamientos?negocio=${business.id}`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Ver todas
              </Link>
            }
          >
            Importaciones recientes
          </SectionTitle>
          {importRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este negocio todavía no procesó fotos.</p>
          ) : (
            <ul className="grid gap-2">
              {importRows.map((imp) => (
                <li key={imp.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-2 text-sm last:border-0">
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <ImportStatusBadge
                        status={imp.status}
                        retrying={imp.status === "pending" && imp.attempts > 0 && Boolean(imp.next_attempt_at && new Date(imp.next_attempt_at).getTime() > now)}
                      />
                      <span className="text-muted-foreground">
                        {formatDateTime(imp.created_at, ADMIN_TZ)} · {SCOPE_LABEL[imp.scope] ?? imp.scope} · {imp.page_count}{" "}
                        {imp.page_count === 1 ? "foto" : "fotos"} · intento {imp.attempts}/{imp.max_attempts}
                      </span>
                      {imp.provider === "mock" && <Badge variant="destructive">Simulado</Badge>}
                    </span>
                    {imp.error_code && (
                      <span className="text-error">
                        {imp.error_code}
                        {imp.error_message ? `: ${imp.error_message}` : ""}
                      </span>
                    )}
                  </span>
                  {imp.status === "failed" && <RetryImportAdminButton importId={imp.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <SectionTitle
            action={
              <Link href={`/admin/auditoria?negocio=${business.id}`} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
                Ver auditoría completa
              </Link>
            }
          >
            Actividad
          </SectionTitle>
          <ul className="grid gap-1.5 text-sm">
            {auditRows.map((a) => {
              const actor = a.actor_id ? profileById.get(a.actor_id) : null;
              return (
                <li key={a.id} className="border-b border-border pb-1.5 last:border-0">
                  <span className="text-muted-foreground">{formatDateTime(a.created_at, ADMIN_TZ)} · </span>
                  <span className="font-medium">{actor?.full_name || actor?.email || ACTOR_KIND_LABEL[a.actor_kind] || a.actor_kind}</span>
                  {a.actor_kind === "platform_admin" && <span className="text-info"> (plataforma)</span>}: {a.summary || a.action}
                </li>
              );
            })}
            {auditRows.length === 0 && <li className="text-muted-foreground">Sin actividad registrada.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
