import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansManager } from "@/components/admin/admin-forms";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/states";
import { requirePlatformAdmin } from "@/server/admin";
import { unwrap } from "@/server/queries/common";

export const metadata: Metadata = { title: "Planes y límites · Administración" };

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Plans />
    </Suspense>
  );
}

async function Plans() {
  const admin = await requirePlatformAdmin();
  if (!admin) return null;
  const { db } = admin;
  const [plans, assignments] = await Promise.all([
    db
      .from("plans")
      .select("id, code, name, description, max_branches, max_members, max_menus, ai_pages_per_month, ai_max_pages_per_import, is_active, is_default")
      .order("ai_pages_per_month"),
    db.from("plan_assignments").select("plan_id").is("ends_at", null),
  ]);
  const counts = new Map<string, number>();
  for (const a of unwrap(assignments, "asignaciones")) counts.set(a.plan_id, (counts.get(a.plan_id) ?? 0) + 1);
  const rows = unwrap(plans, "planes").map((p) => ({ ...p, businesses: counts.get(p.id) ?? 0 }));
  return (
    <>
      <PageHeader
        title="Planes y límites"
        description="Los planes se asignan a mano desde el detalle de cada negocio; no hay cobros en esta etapa. Los límites se aplican en la base de datos, también con cargas simultáneas."
      />
      <PlansManager plans={rows} />
    </>
  );
}
