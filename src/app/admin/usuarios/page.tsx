import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
import { ADMIN_TZ } from "@/components/admin/admin-ui";
import { ADMIN_PAGE_SIZE, Pagination, parsePage, searchTerm } from "@/components/admin/pagination";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, PageSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { formatDate, formatDateTime } from "@/domain/time";
import { requirePlatformAdmin } from "@/server/admin";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Usuarios · Administración" };

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  is_platform_admin: boolean;
  memberships: { business_id: string; business_name: string; role: Role; can_publish: boolean; status: string }[];
}

export default function AdminUsersPage(props: PageProps<"/admin/usuarios">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersList searchParams={props.searchParams} />
    </Suspense>
  );
}

async function UsersList({ searchParams }: { searchParams: PageProps<"/admin/usuarios">["searchParams"] }) {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const page = parsePage(sp.pagina);
  const result = unwrap(
    await admin.db.rpc("admin_list_users", { p_actor_id: admin.user.id, p_query: q, p_limit: ADMIN_PAGE_SIZE, p_offset: (page - 1) * ADMIN_PAGE_SIZE }),
    "usuarios",
  ) as unknown as { total: number; rows: UserRow[] };

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personas con cuenta en CartaLista. El acceso de administrador de plataforma solo se otorga desde la línea de comandos (npm run admin:grant), nunca desde la web."
      />
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]" role="search" aria-label="Buscar usuarios">
        <label className="sr-only" htmlFor="buscar-usuario">
          Buscar por email o nombre
        </label>
        <Input id="buscar-usuario" name="q" defaultValue={q} placeholder="Buscar por email o nombre" />
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" /> Buscar
        </Button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState icon={Users} title={q ? "No hay usuarios con esa búsqueda" : "Todavía no hay usuarios"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Usuarios</caption>
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Persona
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Negocios
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Cuenta
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Último ingreso
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((u) => (
                <tr key={u.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{u.full_name || u.email}</span>
                    {u.full_name && <span className="block text-muted-foreground">{u.email}</span>}
                    {u.is_platform_admin && (
                      <Badge variant="info" className="mt-1">
                        <ShieldCheck aria-hidden="true" /> Administración de plataforma
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.memberships.length === 0 ? (
                      <span className="text-muted-foreground">Sin negocios</span>
                    ) : (
                      <ul className="grid gap-1">
                        {u.memberships.map((m) => (
                          <li key={m.business_id} className="flex flex-wrap items-center gap-2">
                            <Link href={`/admin/negocios/${m.business_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                              {m.business_name}
                            </Link>
                            {m.status === "active" ? (
                              <span className="text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</span>
                            ) : (
                              <Badge variant="muted">Acceso revocado</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.email_confirmed_at ? <Badge variant="success">Email confirmado</Badge> : <Badge variant="warning">Sin confirmar</Badge>}
                    <span className="mt-1 block text-muted-foreground">Alta: {formatDate(u.created_at, ADMIN_TZ)}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at, ADMIN_TZ) : "Nunca"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination basePath="/admin/usuarios" params={{ q }} page={page} total={result.total} />
    </>
  );
}
