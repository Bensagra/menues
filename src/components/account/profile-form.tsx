"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { updatePasswordAction } from "@/server/actions/auth";
import { updateMyProfileAction } from "@/server/actions/panel";

export function ProfileForm({ fullName }: { fullName: string }) {
  const [name, setName] = useState(fullName);
  const [saved, setSaved] = useState(false);
  const { run, pending, error, fieldErrors } = useAction(updateMyProfileAction);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        const r = await run(name);
        if (r.ok) setSaved(true);
      }}
    >
      {saved && (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>Guardaste tu nombre.</AlertDescription>
        </Alert>
      )}
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Tu nombre" hint="Lo ven las personas de tu equipo en el historial." error={fieldErrors._}>
        {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Guardando…" className="justify-self-start" disabled={name.trim() === fullName}>
        Guardar
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const { run, pending, error, fieldErrors } = useAction(updatePasswordAction);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        const r = await run({ password, confirm });
        if (r.ok) {
          setSaved(true);
          setPassword("");
          setConfirm("");
        }
      }}
    >
      {saved && (
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>Actualizaste tu contraseña.</AlertDescription>
        </Alert>
      )}
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Contraseña nueva" hint="Al menos 8 caracteres, con letras y números." error={fieldErrors.password}>
        {(props) => <Input {...props} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
      </FormField>
      <FormField label="Repetí la contraseña" error={fieldErrors.confirm}>
        {(props) => <Input {...props} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />}
      </FormField>
      <SubmitButton pending={pending} pendingLabel="Guardando…" className="justify-self-start" disabled={!password}>
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}
