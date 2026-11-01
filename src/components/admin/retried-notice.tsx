import { CircleCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AppSupabaseClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_TEXT: Record<string, string> = {
  pending: "Quedó en cola: el procesador la toma en cuanto esté activo.",
  processing: "El procesador ya la está leyendo.",
  needs_review: "Ya terminó y espera la revisión del negocio.",
  completed: "Ya se completó.",
  failed: "Volvió a fallar. Revisá el detalle del error.",
  cancelled: "El negocio la canceló.",
};

/** Confirmación persistente de un reintento hecho desde administración. */
export async function RetriedNotice({ db, importId }: { db: AppSupabaseClient; importId: string | undefined }) {
  if (!importId || !UUID.test(importId)) return null;
  const { data } = await db.from("imports").select("id, status, business_id").eq("id", importId).maybeSingle();
  if (!data) return null;
  const { data: business } = await db.from("businesses").select("name").eq("id", data.business_id).maybeSingle();
  return (
    <Alert variant={data.status === "failed" ? "warning" : "success"} className="mb-4">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>Se volvió a encolar la importación{business ? ` de ${business.name}` : ""}</AlertTitle>
      <AlertDescription>{STATUS_TEXT[data.status] ?? ""}</AlertDescription>
    </Alert>
  );
}
