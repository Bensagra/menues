"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAction } from "@/hooks/use-action";
import { cancelImportAction, importStatusAction } from "@/server/actions/imports";

interface Status {
  status: string;
  stage: string;
  stage_page: number | null;
  page_count: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  next_attempt_at: string | null;
  workerOnline: boolean;
}

const ORDER = ["queued", "preparing", "reading", "comparing", "ready"];

/** Progreso real de la importación (etapas registradas por el worker). Sigue en el servidor aunque cierres la pestaña. */
export function ImportProgress({ importId, initial }: { importId: string; initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useAction(cancelImportAction);

  useEffect(() => {
    let active = true;
    const timer = setInterval(async () => {
      const result = await importStatusAction(importId);
      if (!active || !result.ok) return;
      setStatus(result.data as Status);
      if (!["pending", "processing", "uploading"].includes(result.data.status)) {
        clearInterval(timer);
        router.refresh();
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [importId, router]);

  const stage = status.status === "pending" ? "queued" : status.stage;
  const currentIndex = Math.max(0, ORDER.indexOf(stage === "retry_wait" ? "queued" : stage));
  const retrying = status.stage === "retry_wait";
  const steps = [
    { key: "queued", label: retrying ? "Esperando para reintentar" : "En cola" },
    { key: "preparing", label: "Preparando las fotos" },
    {
      key: "reading",
      label: stage === "reading" && status.stage_page ? `Leyendo la página ${status.stage_page} de ${status.page_count}` : `Leyendo ${status.page_count === 1 ? "la foto" : `las ${status.page_count} fotos`}`,
    },
    { key: "comparing", label: "Comparando con tu carta" },
    { key: "ready", label: "Listo para revisar" },
  ];

  return (
    <section aria-labelledby="progreso" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <h2 id="progreso" className="text-lg font-bold">
        Estamos procesando tus fotos
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Podés cerrar esta página: el procesamiento sigue y te esperamos con los cambios listos para revisar.
      </p>
      <ol className="mt-5 grid gap-3" aria-live="polite">
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={step.key} className={cn("flex items-center gap-3", !done && !current && "text-muted-foreground")}>
              {done ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
                  <Check className="size-4" aria-hidden="true" />
                </span>
              ) : current ? (
                <Loader2 className="size-6 text-primary motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Circle className="size-6 text-[#c5ccc2]" aria-hidden="true" />
              )}
              <span className={cn(current && "font-semibold")}>
                {step.label}
                <span className="sr-only">{done ? " (hecho)" : current ? " (en curso)" : " (pendiente)"}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {retrying && status.error_message && (
        <Alert variant="warning" className="mt-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            {status.error_message} Lo vamos a reintentar automáticamente (intento {status.attempts + 1} de {status.max_attempts}).
          </AlertDescription>
        </Alert>
      )}
      {!status.workerOnline && (
        <Alert variant="info" className="mt-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>El procesador de fotos no está respondiendo en este momento. Tu importación quedó en cola y sigue apenas vuelva.</AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <ActionError error={cancel.error} className="mb-3" />
        <SubmitButton type="button" variant="outline" pending={cancel.pending} onClick={() => setConfirmCancel(true)}>
          Cancelar importación
        </SubmitButton>
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="¿Cancelar la importación?"
        description="Se detiene el procesamiento y no se consume cuota. Tu carta no cambia."
        confirmLabel="Cancelar importación"
        cancelLabel="Seguir procesando"
        destructive
        pending={cancel.pending}
        onConfirm={async () => {
          const r = await cancel.run(importId);
          if (r.ok) setConfirmCancel(false);
        }}
      />
    </section>
  );
}
