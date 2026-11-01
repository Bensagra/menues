import { CircleCheck, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const ADMIN_TZ = "America/Argentina/Buenos_Aires";

export function BusinessStatusBadge({ status }: { status: string }) {
  return status === "suspended" ? (
    <Badge variant="destructive">
      <PauseCircle aria-hidden="true" /> Suspendida
    </Badge>
  ) : (
    <Badge variant="success">
      <CircleCheck aria-hidden="true" /> Activa
    </Badge>
  );
}

/** Primer día del mes en UTC (así se agrupa el consumo de IA). */
export function currentMonthKey(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export const ACTOR_KIND_LABEL: Record<string, string> = {
  user: "Equipo del negocio",
  platform_admin: "Administración de la plataforma",
  system: "Sistema",
  worker: "Procesador de fotos",
};
