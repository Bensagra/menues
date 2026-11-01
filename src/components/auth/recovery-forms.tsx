"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { requestPasswordResetAction, updatePasswordAction } from "@/server/actions/auth";

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { run, pending, error, fieldErrors } = useAction(requestPasswordResetAction);

  if (sent) {
    return (
      <Alert variant="success">
        <MailCheck aria-hidden="true" />
        <AlertTitle>Revisá tu email</AlertTitle>
        <AlertDescription>
          Si hay una cuenta con {email}, te llegará un enlace para elegir una contraseña nueva. El enlace vence en una hora.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run({ email });
        if (r.ok) setSent(true);
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Email de tu cuenta" error={fieldErrors.email}>
        {(props) => <Input {...props} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Enviando…" className="w-full" size="lg">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { run, pending, error, fieldErrors } = useAction(updatePasswordAction);
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run({ password, confirm });
        if (r.ok) {
          router.replace("/panel?aviso=contrasena-actualizada");
          router.refresh();
        }
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Contraseña nueva" hint="Al menos 8 caracteres, con letras y números." error={fieldErrors.password}>
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </FormField>
      <FormField label="Repetí la contraseña" error={fieldErrors.confirm}>
        {(props) => (
          <Input {...props} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Guardando…" className="w-full" size="lg">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
