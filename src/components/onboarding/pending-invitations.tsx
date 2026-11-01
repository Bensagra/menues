"use client";

import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { useAction } from "@/hooks/use-action";
import { acceptInvitationByIdAction } from "@/server/actions/onboarding";

export function PendingInvitations({
  invitations,
}: {
  invitations: { invitation_id: string; business_name: string; role: string }[];
}) {
  const router = useRouter();
  const { run, pending, error } = useAction(acceptInvitationByIdAction);
  if (!invitations.length) return null;
  return (
    <section aria-labelledby="invitaciones" className="rounded-xl border border-info/25 bg-info-surface p-5">
      <h2 id="invitaciones" className="flex items-center gap-2 font-bold text-info">
        <Mail className="size-5" aria-hidden="true" /> Te invitaron a un equipo
      </h2>
      <ul className="mt-3 grid gap-3">
        {invitations.map((inv) => (
          <li key={inv.invitation_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-3">
            <span>
              <strong>{inv.business_name}</strong>
              <span className="text-muted-foreground"> · {ROLE_LABELS[inv.role as Role] ?? inv.role}</span>
            </span>
            <SubmitButton
              type="button"
              pending={pending}
              onClick={async () => {
                const r = await run(inv.invitation_id);
                if (r.ok) router.push(`/panel/${r.data.businessSlug}`);
              }}
            >
              Aceptar invitación
            </SubmitButton>
          </li>
        ))}
      </ul>
      <ActionError error={error} className="mt-3" />
    </section>
  );
}
