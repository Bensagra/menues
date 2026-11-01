import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock3,
  EyeOff,
  ListChecks,
  Loader2,
  OctagonAlert,
  RefreshCw,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Variant = "success" | "warning" | "destructive" | "info" | "muted" | "secondary";

function StatusBadge({ icon: Icon, label, variant, spin }: { icon: LucideIcon; label: string; variant: Variant; spin?: boolean }) {
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" className={spin ? "motion-safe:animate-spin" : undefined} />
      {label}
    </Badge>
  );
}

export const IMPORT_STATUS: Record<string, { label: string; variant: Variant; icon: LucideIcon; spin?: boolean }> = {
  uploading: { label: "Subiendo fotos", variant: "info", icon: Upload },
  pending: { label: "Pendiente", variant: "muted", icon: Clock3 },
  processing: { label: "Procesando", variant: "info", icon: Loader2, spin: true },
  needs_review: { label: "Requiere revisión", variant: "warning", icon: ListChecks },
  completed: { label: "Completado", variant: "success", icon: CheckCircle2 },
  failed: { label: "Fallido", variant: "destructive", icon: OctagonAlert },
  cancelled: { label: "Cancelado", variant: "muted", icon: Ban },
};

export function ImportStatusBadge({ status, retrying }: { status: string; retrying?: boolean }) {
  if (status === "pending" && retrying) return <StatusBadge icon={RefreshCw} label="Reintentando" variant="warning" />;
  const meta = IMPORT_STATUS[status] ?? IMPORT_STATUS.pending;
  return <StatusBadge icon={meta.icon} label={meta.label} variant={meta.variant} spin={meta.spin} />;
}

export function ProductStatusBadge({ status }: { status: string }) {
  if (status === "sold_out") return <StatusBadge icon={CircleSlash} label="Agotado" variant="warning" />;
  if (status === "hidden") return <StatusBadge icon={EyeOff} label="Oculto" variant="muted" />;
  return <StatusBadge icon={CheckCircle2} label="Disponible" variant="success" />;
}

export function PublishStateBadge({ state }: { state: "published" | "changes" | "unpublished" }) {
  if (state === "published") return <StatusBadge icon={CheckCircle2} label="Publicada" variant="success" />;
  if (state === "changes") return <StatusBadge icon={CircleDashed} label="Cambios sin publicar" variant="warning" />;
  return <StatusBadge icon={CircleDashed} label="Sin publicar" variant="muted" />;
}

export function SimulatedBadge() {
  return <StatusBadge icon={OctagonAlert} label="Resultado simulado (modo de prueba)" variant="destructive" />;
}
