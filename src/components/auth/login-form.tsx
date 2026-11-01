"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { resendConfirmationAction, signInAction } from "@/server/actions/auth";

export function LoginForm({ next, defaultEmail = "" }: { next?: string; defaultEmail?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [resent, setResent] = useState(false);
  const { run, pending, error, fieldErrors } = useAction(signInAction);
  const resend = useAction(resendConfirmationAction);

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run({ email, password, next });
        if (result.ok) {
          router.replace(result.data.redirectTo);
          router.refresh();
        }
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />
      {error?.code === "email_not_confirmed" && (
        <div className="-mt-2">
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-primary underline underline-offset-4"
            disabled={resend.pending}
            onClick={async () => {
              const r = await resend.run({ email, next });
              if (r.ok) setResent(true);
            }}
          >
            {resent ? "Te enviamos un enlace nuevo" : "Reenviar el email de confirmación"}
          </button>
        </div>
      )}
      <FormField label="Email" error={fieldErrors.email}>
        {(props) => (
          <Input {...props} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </FormField>
      <FormField label="Contraseña" error={fieldErrors.password}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      <div className="-mt-1 text-right">
        <Link href="/recuperar" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          Olvidé mi contraseña
        </Link>
      </div>
      <SubmitButton pending={pending} pendingLabel="Ingresando…" className="w-full" size="lg">
        Ingresar
      </SubmitButton>
    </form>
  );
}
