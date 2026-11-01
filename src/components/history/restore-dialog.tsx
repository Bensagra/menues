"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { ActionError } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction } from "@/hooks/use-action";
import { restoreVersionAction } from "@/server/actions/catalog";

export function RestoreVersionButton({
  versionId,
  versionNumber,
  currentVersionNumber,
  branchName,
  menuName,
  sharedMenu,
  canRestoreDraft,
}: {
  versionId: string;
  versionNumber: number;
  currentVersionNumber: number | null;
  branchName: string;
  menuName: string;
  sharedMenu: boolean;
  canRestoreDraft: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [restoreDraft, setRestoreDraft] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<number | null>(null);
  const { run, pending, error } = useAction(restoreVersionAction);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setKey(crypto.randomUUID());
          setDone(null);
          setOpen(true);
        }}
      >
        <History aria-hidden="true" /> Restaurar esta versión
      </Button>
      {done !== null && (
        <p role="status" className="text-sm font-medium text-success">
          Listo: se publicó la versión {done} con este contenido en {branchName}.
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`¿Restaurar la versión ${versionNumber}?`}
        description={
          <div className="grid gap-2">
            <p>
              Se va a publicar en <strong>{branchName}</strong> una versión nueva de «{menuName}» con el contenido de la versión {versionNumber}.
              {currentVersionNumber ? ` La versión vigente (${currentVersionNumber}) y todas las anteriores quedan en el historial.` : ""}
            </p>
            <p>Tus clientes ven el cambio en cuanto termine.</p>
          </div>
        }
        confirmLabel="Restaurar y publicar"
        pending={pending}
        onConfirm={async () => {
          const r = await run(versionId, restoreDraft, key);
          if (r.ok) {
            setOpen(false);
            setDone(r.data.branches[0]?.version_number ?? null);
          }
        }}
      >
        {canRestoreDraft && (
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <Checkbox checked={restoreDraft} disabled={sharedMenu} onCheckedChange={(v) => setRestoreDraft(Boolean(v))} className="mt-0.5" />
            <span>
              <span className="font-semibold">También reemplazar el borrador</span>
              <span className="block text-muted-foreground">
                {sharedMenu
                  ? "No disponible: esta carta se usa en varias sucursales y cambiar el borrador afectaría a todas."
                  : "El borrador vuelve a quedar como esta versión. Los productos que no estaban se ocultan (no se borran)."}
              </span>
            </span>
          </label>
        )}
        <ActionError error={error} />
      </ConfirmDialog>
    </>
  );
}
