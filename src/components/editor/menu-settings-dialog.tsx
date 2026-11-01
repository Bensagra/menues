"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, TriangleAlert } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { archiveMenuAction, setMenuBranchesAction, updateMenuAction } from "@/server/actions/catalog";
import type { EditorEnv } from "./types";

export function MenuSettingsDialog({
  env,
  menu,
  menuBranchIds,
  allBranches,
  onClose,
}: {
  env: EditorEnv;
  menu: { id: string; name: string; description: string; status: string };
  menuBranchIds: string[];
  allBranches: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description);
  const [branches, setBranches] = useState<string[]>(menuBranchIds);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const rename = useAction(updateMenuAction);
  const assign = useAction(setMenuBranchesAction);
  const archive = useAction(archiveMenuAction);
  const removed = menuBranchIds.filter((id) => !branches.includes(id));
  const removedNames = allBranches.filter((b) => removed.includes(b.id)).map((b) => b.name);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar la carta</DialogTitle>
          <DialogDescription>Nombre, sucursales donde se muestra y archivo.</DialogDescription>
        </DialogHeader>

        {env.canEditContent && (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await rename.run(menu.id, { name, description });
            }}
          >
            <ActionError error={rename.error && rename.error.code !== "validation" ? rename.error : null} />
            <FormField label="Nombre" error={rename.fieldErrors.name}>
              {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
            </FormField>
            <FormField label="Descripción" optional error={rename.fieldErrors.description}>
              {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />}
            </FormField>
            <SubmitButton pending={rename.pending} pendingLabel="Guardando…" variant="outline" className="justify-self-start">
              Guardar nombre
            </SubmitButton>
          </form>
        )}

        {env.canManage && (
          <>
            <Separator />
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await assign.run(menu.id, branches);
              }}
            >
              <fieldset className="grid gap-1">
                <legend className="mb-1 text-sm font-bold">Sucursales donde se muestra</legend>
                {allBranches.map((b) => (
                  <label key={b.id} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={branches.includes(b.id)}
                      onCheckedChange={(checked) => setBranches((s) => (checked ? [...s, b.id] : s.filter((id) => id !== b.id)))}
                    />
                    {b.name}
                  </label>
                ))}
              </fieldset>
              {removedNames.length > 0 && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    La carta dejará de mostrarse en {removedNames.join(", ")} en cuanto guardes, y se borran sus precios propios de esas sucursales.
                  </AlertDescription>
                </Alert>
              )}
              <ActionError error={assign.error} />
              <SubmitButton pending={assign.pending} pendingLabel="Guardando…" variant="outline" className="justify-self-start">
                Guardar sucursales
              </SubmitButton>
              {assign.error === null && !assign.pending && branches.length !== menuBranchIds.length && (
                <p className="text-[13px] text-muted-foreground">Las sucursales nuevas muestran la carta recién cuando la publicás.</p>
              )}
            </form>

            {menu.status === "active" && (
              <>
                <Separator />
                {confirmArchive ? (
                  <div className="grid gap-2">
                    <p className="text-sm">
                      ¿Archivar «{menu.name}»? Deja de mostrarse en la carta pública en este momento. El historial se conserva y podés restaurarla.
                    </p>
                    <ActionError error={archive.error} />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setConfirmArchive(false)} disabled={archive.pending}>
                        Cancelar
                      </Button>
                      <SubmitButton
                        type="button"
                        variant="destructive"
                        pending={archive.pending}
                        onClick={async () => {
                          const r = await archive.run(menu.id, true);
                          if (r.ok) router.push(`${env.base}/menus`);
                        }}
                      >
                        Archivar carta
                      </SubmitButton>
                    </div>
                  </div>
                ) : (
                  <Button variant="destructive-outline" className="justify-self-start" onClick={() => setConfirmArchive(true)}>
                    <Archive aria-hidden="true" /> Archivar carta
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
