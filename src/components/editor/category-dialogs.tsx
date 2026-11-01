"use client";

import { useState } from "react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/server/actions/catalog";
import type { EditorCategory } from "./types";

export function CategoryDialog({
  menuId,
  category,
  onClose,
}: {
  menuId: string;
  category: EditorCategory | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const create = useAction(createCategoryAction);
  const update = useAction(updateCategoryAction);
  const current = category ? update : create;
  return (
    <Dialog open onOpenChange={(open) => !open && !current.pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          <DialogDescription>Por ejemplo: Entradas, Principales, Postres o Bebidas.</DialogDescription>
        </DialogHeader>
        <form
          id="category-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = category
              ? await update.run(category.id, { name, description, expectedRevision: category.revision })
              : await create.run(menuId, { name, description });
            if (r.ok) onClose();
          }}
        >
          <ActionError error={current.error && current.error.code !== "validation" ? current.error : null} />
          <FormField label="Nombre" error={current.fieldErrors.name}>
            {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Descripción" optional hint="Se muestra debajo del título en la carta." error={current.fieldErrors.description}>
            {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />}
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={current.pending}>
            Cancelar
          </Button>
          <SubmitButton pending={current.pending} pendingLabel="Guardando…" form="category-form">
            {category ? "Guardar" : "Crear categoría"}
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Eliminar una categoría: si tiene productos, hay que elegir adónde moverlos o cancelar. */
export function DeleteCategoryDialog({
  category,
  productCount,
  others,
  onClose,
}: {
  category: EditorCategory;
  productCount: number;
  others: EditorCategory[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const { run, pending, error } = useAction(deleteCategoryAction);
  const needsMove = productCount > 0;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`¿Eliminar la categoría «${category.name}»?`}
      description={
        needsMove
          ? `Tiene ${productCount} ${productCount === 1 ? "producto" : "productos"} (incluidos los archivados). Elegí a qué categoría moverlos antes de eliminarla.`
          : "La categoría está vacía. Las versiones ya publicadas no cambian hasta que publiques."
      }
      confirmLabel={needsMove ? "Mover productos y eliminar" : "Eliminar categoría"}
      destructive
      pending={pending}
      confirmDisabled={needsMove && !target}
      onConfirm={async () => {
        const r = await run(category.id, needsMove ? target : null);
        if (r.ok) onClose();
      }}
    >
      {needsMove &&
        (others.length ? (
          <FormField label="Mover los productos a">
            {(props) => (
              <NativeSelect {...props} value={target} onChange={(e) => setTarget(e.target.value)}>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        ) : (
          <p className="text-sm text-warning">Creá otra categoría primero para poder mover los productos.</p>
        ))}
      <ActionError error={error} />
    </ConfirmDialog>
  );
}
