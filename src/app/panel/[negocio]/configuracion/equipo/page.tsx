import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TeamManager, type InvitationRow, type MemberRow } from "@/components/settings/team-manager";
import type { Role } from "@/domain/permissions";
import { getBusinessContext } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { unwrap } from "@/server/queries/common";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Equipo" };

export default function TeamPage(props: PageProps<"/panel/[negocio]/configuracion/equipo">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <Team params={props.params} />
    </Suspense>
  );
}

async function Team({ params }: { params: PageProps<"/panel/[negocio]/configuracion/equipo">["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["team.view"]) return <RestrictedState backHref={base} />;
  const supabase = await createClient();
  const [memberships, invitations, plan] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, role, can_publish, all_branches, membership_branches(branch_id)")
      .eq("business_id", ctx.business.id)
      .eq("status", "active")
      .order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, can_publish, all_branches, expires_at, invitation_branches(branch_id)")
      .eq("business_id", ctx.business.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_plan_overview", { p_business_id: ctx.business.id }),
  ]);
  const rows = unwrap(memberships, "equipo");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in(
      "id",
      rows.map((r) => r.user_id),
    );
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members: MemberRow[] = rows
    .map((r) => {
      const profile = profileById.get(r.user_id);
      return {
        membershipId: r.id,
        userId: r.user_id,
        name: profile?.full_name || profile?.email || "Usuario",
        email: profile?.email ?? "",
        role: r.role as Role,
        canPublish: r.can_publish,
        allBranches: r.all_branches,
        branchIds: (r.membership_branches ?? []).map((mb) => mb.branch_id),
        isSelf: r.user_id === ctx.user.id,
      };
    })
    .sort((a, b) => ["owner", "admin", "editor"].indexOf(a.role) - ["owner", "admin", "editor"].indexOf(b.role));
  const now = await requestTime();
  const invitationRows: InvitationRow[] = unwrap(invitations, "invitaciones").map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as Role,
    canPublish: i.can_publish,
    allBranches: i.all_branches,
    branchIds: (i.invitation_branches ?? []).map((b) => b.branch_id),
    expiresAt: i.expires_at,
    expired: new Date(i.expires_at).getTime() <= now,
  }));
  const overview = unwrap(plan, "plan") as unknown as { plan: { max_members: number }; members: number; open_invitations: number };

  return (
    <>
      <PageHeader title="Configuración" description="Datos del local, sucursales, equipo y plan." />
      <SettingsNav base={base} current="equipo" permissions={ctx.permissions} />
      <TeamManager
        businessId={ctx.business.id}
        businessName={ctx.business.name}
        actorRole={ctx.scope.role}
        canManage={ctx.permissions["team.manage"] && !ctx.suspended}
        members={members}
        invitations={invitationRows}
        branches={ctx.branches.map((b) => ({ id: b.id, name: b.name }))}
        timezone={ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires"}
        seats={{ used: overview.members + overview.open_invitations, limit: overview.plan.max_members }}
      />
    </>
  );
}
