import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Search } from "lucide-react";
import { CreateBusinessButton } from "@/components/admin/admin-forms";
import { ADMIN_TZ, BusinessStatusBadge, currentMonthKey } from "@/components/admin/admin-ui";
import { ADMIN_PAGE_SIZE, Pagination, paramValue, parsePage, searchTerm } from "@/components/admin/pagination";
import { NativeSelect } from "@/components/app/native-select";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, PageSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, supportedTimezones } from "@/domain/time";
import { requirePlatformAdmin } from "@/server/admin";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Negocios · Administración" };

export default function AdminBusinessesPage(props: PageProps<"/admin/negocios">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Businesses searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Businesses({ searchParams }: { searchParams: PageProps<"/admin/negocios">["searchParams"] }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const estado = ["active", "suspended"].includes(paramValue(sp.estado)) ? paramValue(sp.estado) : "";
  const page = parsePage(sp.pagina);

  let query = db
    .from("businesses")
    .select("id, name, slug, status, currency, created_at, suspended_reason, branches(count), memberships(count)", { count: "exact" })
    .eq("memberships.status", "active")
    .order("created_at", { ascending: false })
    .range((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE - 1);
  if (estado) query = query.eq("status", estado);
  if (q) query = query.or(`name.ilike.*${q}*,slug.ilike.*${q}*`);

  const [result, plansResult] = await Promise.all([
    query,
    db.from("plans").select("id, name, is_default, ai_pages_per_month").eq("is_active", true).order("ai_pages_per_month"),
  ]);
  const businesses = unwrap(result, "negocios");
  const plans = unwrap(plansResult, "planes");
  const ids = businesses.map((b) => b.id);
  const [assignments, usage] = ids.length
    ? await Promise.all([
        db.from("plan_assignments").select("business_id, plans(name, ai_pages_per_month)").in("business_id", ids).is("ends_at", null),
        db.from("ai_usage_months").select("business_id, pages_used, pages_reserved").eq("month", currentMonthKey()).in("business_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const planByBusiness = new Map(
    (assignments.data ?? []).map((a) => [a.business_id, a.plans as unknown as { name: string; ai_pages_per_month: number } | null]),
  );
  const usageByBusiness = new Map((usage.data ?? []).map((u) => [u.business_id, u]));
  const count = (value: unknown) => (Array.isArray(value) ? ((value[0] as { count?: number } | undefined)?.count ?? 0) : 0);

  return (
    <>
      <PageHeader
        title="Negocios"
        description="Cuentas comerciales de la plataforma, su plan y su consumo del mes."
        actions={<CreateBusinessButton plans={plans} timezones={supportedTimezones()} />}
      />

      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]" role="search" aria-label="Buscar negocios">
        <label className="sr-only" htmlFor="buscar-negocio">
          Buscar por nombre o identificador
        </label>
        <Input id="buscar-negocio" name="q" defaultValue={q} placeholder="Buscar por nombre o identificador" />
        <label className="sr-only" htmlFor="estado-negocio">
          Estado
        </label>
        <NativeSelect id="estado-negocio" name="estado" defaultValue={estado}>
          <option value="">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" /> Buscar
        </Button>
      </form>

      {businesses.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q || estado ? "No hay negocios con esos filtros" : "Todavía no hay negocios"}
          description={q || estado ? "Probá con otra búsqueda o quitá el filtro de estado." : "Creá el primero con «Nuevo negocio»."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Negocios</caption>
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Negocio
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Plan
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Sucursales
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Equipo
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Fotos del mes
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Alta
                </th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => {
                const plan = planByBusiness.get(b.id);
                const u = usageByBusiness.get(b.id);
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-[#f7f5ef]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/negocios/${b.id}`} className="font-semibold text-primary underline-offset-4 hover:underline">
                        {b.name}
                      </Link>
                      <span className="block text-muted-foreground">
                        {b.slug} · {b.currency}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <BusinessStatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3">{plan?.name ?? "Sin plan"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(b.branches)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(b.memberships)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(u?.pages_used ?? 0) + (u?.pages_reserved ?? 0)}
                      {plan ? <span className="text-muted-foreground"> / {plan.ai_pages_per_month}</span> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(b.created_at, ADMIN_TZ)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination basePath="/admin/negocios" params={{ q, estado }} page={page} total={result.count ?? 0} />
    </>
  );
}
