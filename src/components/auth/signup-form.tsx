"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { resendConfirmationAction, signUpAction } from "@/server/actions/auth";

export function SignupForm({ next, defaultEmail = "" }: { next?: string; defaultEmail?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const { run, pending, error, fieldErrors } = useAction(signUpAction);
  const resend = useAction(resendConfirmationAction);

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <Alert variant="success">
          <MailCheck aria-hidden="true" />
          <AlertTitle>Revisá tu email</AlertTitle>
          <AlertDescription>
            Te enviamos un enlace a <strong>{sentTo}</strong> para confirmar tu cuenta. Abrilo desde este dispositivo para seguir.
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          ¿No te llegó? Revisá la carpeta de spam o pedí otro enlace.
        </p>
        <SubmitButton
          type="button"
          variant="outline"
          pending={resend.pending}
          disabled={resent}
          onClick={async () => {
            const r = await resend.run({ email: sentTo, next });
            if (r.ok) setResent(true);
          }}
        >
          {resent ? "Enlace reenviado" : "Reenviar enlace"}
        </SubmitButton>
        <ActionError error={resend.error} />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run({ fullName, email, password, next });
        if (!result.ok) return;
        if (result.data.needsConfirmation) setSentTo(email.trim().toLowerCase());
        else {
          router.replace(result.data.redirectTo);
          router.refresh();
        }
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Tu nombre" error={fieldErrors.fullName}>
        {(props) => <Input {...props} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />}
      </FormField>
      <FormField label="Email" error={fieldErrors.email}>
        {(props) => <Input {...props} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
      </FormField>
      <FormField label="Contraseña" hint="Al menos 8 caracteres, con letras y números." error={fieldErrors.password}>
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Creando tu cuenta…" className="w-full" size="lg">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}
