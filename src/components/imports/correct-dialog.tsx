"use client";

import { useState } from "react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { MoneyInput } from "@/components/app/money-input";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nameKey } from "@/domain/text";
import { useAction } from "@/hooks/use-action";
import { decideProposalAction } from "@/server/actions/imports";
import type { ReviewProposal } from "@/server/queries/imports";

interface VariantValue {
  variant_id?: string | null;
  name: string;
  price_minor: number | null;
}

type Mode = "correct" | "same" | "new";

export function CorrectDialog({
  proposal,
  mode,
  scope,
  currency,
  locale,
  categories,
  newCategoryRefs,
  onClose,
}: {
  proposal: ReviewProposal;
  mode: Mode;
  scope: string;
  currency: string;
  locale: string;
  categories: { id: string; name: string }[];
  newCategoryRefs: { ref: string; name: string }[];
  onClose: () => void;
}) {
  const pricesOnly = scope === "prices_only";
  const current = (proposal.current_value ?? {}) as { name?: string; description?: string; price_minor?: number | null; variants?: VariantValue[] };
  const detected = proposal.detected_value as { name?: string | null; description?: string | null; price_text?: string | null; variants?: { name: string | null; price_text: string | null }[] };
  const proposed = (proposal.proposed_value ?? {}) as { name?: string; description?: string; price_minor?: number | null; variants?: VariantValue[]; category_id?: string; category_ref?: string };
  const kind = proposal.kind;
  const isNew = kind === "new_product" || mode === "new" || (kind === "illegible" && !proposal.product_id);

  // Variantes: las del producto actual (con id) completadas con lo detectado.
  const baseVariants: VariantValue[] = (() => {
    const list = proposed.variants ?? current.variants ?? [];
    if (mode === "same" && current.variants?.length) {
      return (proposed.variants ?? []).map((v) => {
        const match = current.variants!.find((c) => nameKey(c.name) === nameKey(v.name));
        return { variant_id: match?.variant_id ?? null, name: match?.name ?? v.name, price_minor: v.price_minor };
      });
    }
    if (kind === "variant_change" && !proposal.proposed_value) return (current.variants ?? []).map((v) => ({ ...v }));
    return list.map((v) => ({ ...v }));
  })();

  const [name, setName] = useState(proposed.name ?? (isNew ? detected.name ?? "" : current.name ?? ""));
  const [useDetectedName, setUseDetectedName] = useState(false);
  const [description, setDescription] = useState(proposed.description ?? detected.description ?? "");
  const [price, setPrice] = useState<number | null>(proposed.price_minor ?? (kind === "illegible" ? null : current.price_minor ?? null));
  const [variants, setVariants] = useState<VariantValue[]>(baseVariants);
  const [category, setCategory] = useState(proposed.category_id ?? proposal.category_id ?? (proposed.category_ref ? `ref:${proposed.category_ref}` : categories[0]?.id ?? ""));
  const resolution = mode;
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const { run, pending, error } = useAction(decideProposalAction);

  const hasVariants = variants.length > 0;
  const showName = isNew || kind === "name_change" || (kind === "illegible" && !proposal.product_id);
  const showDescription = !pricesOnly && (isNew || kind === "description_change");
  const showCategory = isNew;
  const showPrice = !hasVariants && (kind !== "description_change" && kind !== "name_change" && kind !== "new_category");

  function payload(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (kind === "uncertain_match" || kind === "possible_duplicate" || (kind === "illegible" && proposal.product_id)) {
      out.resolution = resolution === "new" ? "new" : "same";
    }
    if (kind === "new_category") return { name };
    if (showName) out.name = name;
    if (mode === "same" && !pricesOnly) out.name = useDetectedName ? detected.name ?? current.name : null;
    if (showDescription) out.description = description || null;
    if (mode === "same" && !pricesOnly) out.description = null;
    if (hasVariants) out.variants = variants.map((v) => ({ variant_id: v.variant_id ?? null, name: v.name, price_minor: v.price_minor }));
    else if (showPrice) out.price_minor = price;
    if (showCategory) {
      if (category.startsWith("ref:")) out.category_ref = category.slice(4);
      else if (category) out.category_id = category;
    }
    return out;
  }

  const title =
    mode === "same" ? "Es el mismo producto" : mode === "new" ? "Agregar como producto nuevo" : kind === "new_category" ? "Corregir categoría" : "Corregir el dato";

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "same"
              ? `Se actualiza «${current.name}» con lo que indiques. ${pricesOnly ? "Con «Solo precios» solo cambia el precio." : "Su nombre no cambia salvo que lo marques."}`
              : detected.price_text
                ? `En la foto dice: «${detected.price_text}». Escribí el valor correcto.`
                : "Escribí el valor correcto. Nada se aplica hasta que confirmes los cambios."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="correct-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (Object.values(errors).some(Boolean)) return;
            const r = await run(proposal.id, "approve", payload() as never);
            if (r.ok) onClose();
          }}
        >
          <ActionError error={error} />
          {(showName || kind === "new_category") && (
            <FormField label="Nombre">{(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
          )}
          {mode === "same" && !pricesOnly && detected.name && detected.name !== current.name && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox checked={useDetectedName} onCheckedChange={(v) => setUseDetectedName(Boolean(v))} />
              Cambiar el nombre a «{detected.name}»
            </label>
          )}
          {showDescription && (
            <FormField label="Descripción" optional>
              {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />}
            </FormField>
          )}
          {showCategory && (
            <FormField label="Categoría">
              {(props) => (
                <NativeSelect {...props} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {newCategoryRefs.map((c) => (
                    <option key={c.ref} value={`ref:${c.ref}`}>
                      {c.name} (nueva)
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          {showPrice && (
            <FormField label="Precio" error={errors.price ?? undefined}>
              {(props) => (
                <MoneyInput
                  {...props}
                  value={price}
                  currency={currency}
                  locale={locale}
                  allowEmpty={isNew}
                  onValueChange={(minor, err) => {
                    setPrice(minor);
                    setErrors((s) => ({ ...s, price: err }));
                  }}
                />
              )}
            </FormField>
          )}
          {hasVariants && (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-semibold">Precios por variante</legend>
              {variants.map((v, i) => (
                <div key={`${v.variant_id ?? v.name}-${i}`} className="grid grid-cols-[1fr_10rem] items-end gap-2">
                  {v.variant_id ? (
                    <p className="pb-3 font-medium">{v.name}</p>
                  ) : (
                    <FormField label={`Variante ${i + 1}`}>
                      {(props) => (
                        <Input {...props} value={v.name} onChange={(e) => setVariants((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      )}
                    </FormField>
                  )}
                  <FormField label="Precio" error={errors[`v${i}`] ?? undefined}>
                    {(props) => (
                      <MoneyInput
                        {...props}
                        value={v.price_minor}
                        currency={currency}
                        locale={locale}
                        onValueChange={(minor, err) => {
                          setVariants((list) => list.map((x, j) => (j === i ? { ...x, price_minor: minor } : x)));
                          setErrors((s) => ({ ...s, [`v${i}`]: err }));
                        }}
                      />
                    )}
                  </FormField>
                </div>
              ))}
            </fieldset>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="correct-form" pending={pending} pendingLabel="Guardando…">
            Aprobar con estos datos
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
