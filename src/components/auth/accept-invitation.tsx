"use client";

import { useRouter } from "next/navigation";
import { ActionError, SubmitButton } from "@/components/app/form";
import { useAction } from "@/hooks/use-action";
import { acceptInvitationAction } from "@/server/actions/onboarding";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction(acceptInvitationAction);
  return (
    <div className="grid gap-3">
      <ActionError error={error} />
      <SubmitButton
        type="button"
        size="lg"
        pending={pending}
        pendingLabel="Aceptando…"
        onClick={async () => {
          const r = await run(token);
          if (r.ok) router.push(`/panel/${r.data.businessSlug}`);
        }}
      >
        Aceptar invitación
      </SubmitButton>
    </div>
  );
}
