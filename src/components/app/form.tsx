"use client";

import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { CircleAlert, LogIn } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AppError } from "@/lib/errors";

/** Campo con label persistente, ayuda y error asociados por aria-describedby. */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
  optional,
  id: givenId,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  id?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const generated = useId();
  const id = givenId ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, ...(error ? { "aria-invalid": true as const } : {}) })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] font-medium text-error">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Error de una acción, visible en la pantalla. Si la sesión venció, ofrece
 * ingresar en otra pestaña para no perder lo escrito.
 */
export function ActionError({ error, className }: { error: AppError | null; className?: string }) {
  if (!error) return null;
  if (error.code === "session_expired") {
    return (
      <Alert variant="warning" className={className}>
        <LogIn aria-hidden="true" />
        <AlertTitle>Tu sesión venció</AlertTitle>
        <AlertDescription>Iniciá sesión en otra pestaña y después volvé a intentar: lo que escribiste sigue acá.</AlertDescription>
        <AlertAction>
          <Button asChild size="sm" variant="outline">
            <a href="/ingresar?motivo=sesion-vencida" target="_blank" rel="noopener">
              Iniciar sesión en otra pestaña
            </a>
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive" className={className}>
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
  variant,
  size,
  disabled,
  onClick,
  type = "submit",
  form,
}: {
  form?: string;
  pending: boolean;
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "destructive-outline" | "ghost";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  type?: "submit" | "button";
}) {
  return (
    <Button
      type={type}
      form={form}
      className={className}
      variant={variant}
      size={size}
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={onClick}
    >
      {pending && <Spinner aria-hidden="true" />}
      {pending ? pendingLabel ?? children : children}
    </Button>
  );
}
