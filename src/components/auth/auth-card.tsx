import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}

const REASONS: Record<string, { variant: "info" | "warning" | "success"; text: string }> = {
  "sesion-vencida": { variant: "warning", text: "Tu sesión venció. Ingresá de nuevo para continuar." },
  salida: { variant: "success", text: "Cerraste sesión." },
  "enlace-invalido": { variant: "warning", text: "El enlace venció o ya se usó. Pedí uno nuevo." },
  "contrasena-actualizada": { variant: "success", text: "Actualizaste tu contraseña. Ya podés ingresar." },
  invitacion: { variant: "info", text: "Ingresá o creá tu cuenta con el email al que te invitaron para aceptar la invitación." },
};

export function ReasonNotice({ reason }: { reason?: string }) {
  const meta = reason ? REASONS[reason] : undefined;
  if (!meta) return null;
  const Icon = meta.variant === "success" ? CircleCheck : meta.variant === "warning" ? TriangleAlert : Info;
  return (
    <Alert variant={meta.variant} className="mb-4">
      <Icon aria-hidden="true" />
      <AlertDescription>{meta.text}</AlertDescription>
    </Alert>
  );
}
