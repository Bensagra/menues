"use client";

import { useState } from "react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { MoneyInput } from "@/components/app/money-input";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/domain/money";
import { PRODUCT_STATUS_LABELS, type ProductStatus } from "@/domain/snapshot";
import { useAction } from "@/hooks/use-action";
import { setBranchOverrideAction } from "@/server/actions/catalog";
import type { EditorEnv, EditorProduct } from "./types";

/** Precio y disponibilidad propios de una sucursal en una carta compartida. */
export function BranchPricesDialog({ env, product, onClose }: { env: EditorEnv; product: EditorProduct; onClose: () => void }) {
  const accessible = env.branches.filter((b) => b.accessible);
  const [branchId, setBranchId] = useState(accessible[0]?.id ?? "");
  const override = product.overrides.find((o) => o.branch_id === branchId);
  const [price, setPrice] = useState<number | null>(override?.price_minor ?? null);
  const [status, setStatus] = useState<string>(override?.status ?? "");
  const [variantPrices, setVariantPrices] = useState<Record<string, number | null>>(
    Object.fromEntries(product.variants.map((v) => [v.id, product.variantPrices.find((vp) => vp.variant_id === v.id && vp.branch_id === branchId)?.price_minor ?? null])),
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const { run, pending, error } = useAction(setBranchOverrideAction);
  const fmt = (minor: number | null) => (minor === null ? "sin precio" : formatMoney(minor, env.currency, env.locale));

  function selectBranch(id: string) {
    setBranchId(id);
    const o = product.overrides.find((x) => x.branch_id === id);
    setPrice(o?.price_minor ?? null);
    setStatus(o?.status ?? "");
    setVariantPrices(
      Object.fromEntries(product.variants.map((v) => [v.id, product.variantPrices.find((vp) => vp.variant_id === v.id && vp.branch_id === id)?.price_minor ?? null])),
    );
  }

  const others = env.branches.filter((b) => b.id !== branchId).map((b) => b.name);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Precios por sucursal · {product.name}</DialogTitle>
          <DialogDescription>
            Dejá un campo vacío para usar el valor general de la carta. Este cambio afecta solo a la sucursal elegida
            {others.length ? ` (no a ${others.join(", ")})` : ""} y se ve en la carta pública cuando publicás.
          </DialogDescription>
        </DialogHeader>
        <form
          id="branch-prices"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (Object.values(errors).some(Boolean)) return;
            const r = await run({
              productId: product.id,
              branchId,
              priceMinor: product.variants.length ? null : price,
              status: (status || null) as ProductStatus | null,
              variantPrices: product.variants.map((v) => ({ variantId: v.id, priceMinor: variantPrices[v.id] ?? null })),
            });
            if (r.ok) onClose();
          }}
        >
          <ActionError error={error} />
          {accessible.length > 1 && (
            <FormField label="Sucursal">
              {(props) => (
                <NativeSelect {...props} value={branchId} onChange={(e) => selectBranch(e.target.value)}>
                  {accessible.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}
          {product.variants.length === 0 ? (
            <FormField label="Precio en esta sucursal" optional hint={`Precio general: ${fmt(product.price_minor)}`} error={errors.price ?? undefined}>
              {(props) => (
                <MoneyInput
                  {...props}
                  value={price}
                  currency={env.currency}
                  locale={env.locale}
                  onValueChange={(minor, err) => {
                    setPrice(minor);
                    setErrors((s) => ({ ...s, price: err }));
                  }}
                />
              )}
            </FormField>
          ) : (
            product.variants.map((v) => (
              <FormField key={v.id} label={`${v.name} en esta sucursal`} optional hint={`Precio general: ${fmt(v.price_minor)}`} error={errors[v.id] ?? undefined}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={variantPrices[v.id] ?? null}
                    currency={env.currency}
                    locale={env.locale}
                    onValueChange={(minor, err) => {
                      setVariantPrices((s) => ({ ...s, [v.id]: minor }));
                      setErrors((s) => ({ ...s, [v.id]: err }));
                    }}
                  />
                )}
              </FormField>
            ))
          )}
          <FormField label="Disponibilidad en esta sucursal" hint={`General: ${PRODUCT_STATUS_LABELS[product.status]}`}>
            {(props) => (
              <NativeSelect {...props} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Igual que la carta general</option>
                {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="branch-prices" pending={pending} pendingLabel="Guardando…">
            Guardar borrador
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
