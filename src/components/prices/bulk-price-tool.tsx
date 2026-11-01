"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CircleCheck, Eye, Info, Send, Store } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { MoneyInput } from "@/components/app/money-input";
import { NativeSelect } from "@/components/app/native-select";
import { PublishDialog } from "@/components/editor/publish-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { roundingSteps, type BulkPriceRule } from "@/domain/bulk-prices";
import { formatMoney, parsePercentInput, type RoundingMode } from "@/domain/money";
import { useAction } from "@/hooks/use-action";
import { applyBulkPricesAction, previewBulkPricesAction, type BulkPricePreview } from "@/server/actions/prices";

export interface BulkPriceEnv {
  base: string;
  appUrl: string;
  menuId: string;
  menuName: string;
  currency: string;
  locale: string;
  categories: { id: string; name: string; products: number }[];
  /** Sucursales de la carta a las que la persona tiene acceso */
  branches: { id: string; name: string; slug: string }[];
  /** Puede cambiar el precio general (tiene alcance sobre todas las sucursales de la carta) */
  canEditBase: boolean;
  canPublish: boolean;
}

const MODES: { value: RoundingMode; label: string }[] = [
  { value: "nearest", label: "Al más cercano" },
  { value: "up", label: "Hacia arriba" },
  { value: "down", label: "Hacia abajo" },
];

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function BulkPriceTool({ env }: { env: BulkPriceEnv }) {
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [percentText, setPercentText] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<RoundingMode>("nearest");
  const [allCategories, setAllCategories] = useState(true);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(env.canEditBase ? "base" : (env.branches[0]?.id ?? "base"));
  const [preview, setPreview] = useState<{ data: BulkPricePreview; rule: BulkPriceRule } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState<{ changed: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const previewAction = useAction(previewBulkPricesAction);
  const applyAction = useAction(applyBulkPricesAction);
  const fmt = (minor: number) => formatMoney(minor, env.currency, env.locale);
  const steps = roundingSteps(env.currency);
  const branchName = new Map(env.branches.map((b) => [b.id, b.name]));

  // Cualquier cambio en la regla invalida la vista previa.
  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPreview(null);
    setApplied(null);
    setFormError(null);
  };

  function buildRule(): BulkPriceRule | null {
    let change: BulkPriceRule["change"];
    if (kind === "percent") {
      const bp = parsePercentInput(percentText);
      if (bp === null || bp <= 0) {
        setFormError("Escribí un porcentaje, por ejemplo 10 o 12,5.");
        return null;
      }
      change = { type: "percent", basisPoints: direction === "up" ? bp : -bp };
    } else {
      if (!amount) {
        setFormError("Escribí un importe mayor que cero.");
        return null;
      }
      change = { type: "amount", minor: direction === "up" ? amount : -amount };
    }
    if (!allCategories && categoryIds.length === 0) {
      setFormError("Elegí al menos una categoría.");
      return null;
    }
    return {
      change,
      rounding: step > 1 ? { step, mode } : { step: 1, mode: "none" },
      target: target === "base" ? { type: "base" } : { type: "branch", branchId: target },
      categoryIds: allCategories ? null : categoryIds,
    };
  }

  async function runPreview() {
    setFormError(null);
    const rule = buildRule();
    if (!rule) return;
    const r = await previewAction.run(env.menuId, rule);
    if (r.ok) setPreview({ data: r.data, rule });
  }

  const describeChange = (rule: BulkPriceRule) => {
    const sign = (n: number) => (n > 0 ? "Aumento" : "Baja");
    const main =
      rule.change.type === "percent"
        ? `${sign(rule.change.basisPoints)} de ${(Math.abs(rule.change.basisPoints) / 100).toLocaleString(env.locale)} %`
        : `${sign(rule.change.minor)} de ${fmt(Math.abs(rule.change.minor))}`;
    const rounding = rule.rounding.step > 1 ? `, redondeo ${MODES.find((m) => m.value === rule.rounding.mode)?.label.toLowerCase()} a ${fmt(rule.rounding.step)}` : "";
    return main + rounding;
  };

  const data = preview?.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <form
        className="grid gap-5 rounded-xl border border-border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void runPreview();
        }}
        aria-label="Regla de precios"
      >
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Qué cambiar</legend>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect aria-label="Dirección" value={direction} onChange={(e) => edit(setDirection)(e.target.value as "up" | "down")}>
              <option value="up">Aumentar</option>
              <option value="down">Bajar</option>
            </NativeSelect>
            <NativeSelect aria-label="Tipo de cambio" value={kind} onChange={(e) => edit(setKind)(e.target.value as "percent" | "amount")}>
              <option value="percent">Porcentaje</option>
              <option value="amount">Importe fijo</option>
            </NativeSelect>
          </div>
          {kind === "percent" ? (
            <FormField label="Porcentaje" hint="Por ejemplo 10 o 12,5.">
              {(props) => (
                <div className="relative">
                  <Input {...props} inputMode="decimal" value={percentText} onChange={(e) => edit(setPercentText)(e.target.value)} className="pr-9 tabular-nums" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
                    %
                  </span>
                </div>
              )}
            </FormField>
          ) : (
            <FormField label="Importe">
              {(props) => <MoneyInput {...props} value={amount} currency={env.currency} locale={env.locale} onValueChange={(v) => edit(setAmount)(v)} />}
            </FormField>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Redondeo</legend>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect aria-label="Redondear a" value={String(step)} onChange={(e) => edit(setStep)(Number(e.target.value))}>
              <option value="1">Sin redondeo</option>
              {steps.map((s) => (
                <option key={s} value={s}>
                  A {fmt(s)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Sentido del redondeo" value={mode} disabled={step <= 1} onChange={(e) => edit(setMode)(e.target.value as RoundingMode)}>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Dónde</legend>
          <RadioGroup value={target} onValueChange={edit(setTarget)} className="grid gap-2">
            {env.canEditBase && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="base" className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-semibold">Precio general</span>
                  <span className="block text-muted-foreground">
                    Para {joinNames(env.branches.map((b) => b.name))}. Los precios propios de una sucursal no cambian.
                  </span>
                </span>
              </label>
            )}
            {env.branches.map((b) => (
              <label key={b.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value={b.id} className="mt-0.5" />
                <span className="text-sm">
                  <span className="font-semibold">Solo en {b.name}</span>
                  <span className="block text-muted-foreground">Crea o actualiza precios propios de esta sucursal.</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Categorías</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <Checkbox checked={allCategories} onCheckedChange={(c) => edit(setAllCategories)(c === true)} />
            Toda la carta
          </label>
          {!allCategories && (
            <div className="grid gap-1 rounded-lg border border-border p-2">
              {env.categories.map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-3 px-1 text-sm">
                  <Checkbox
                    checked={categoryIds.includes(c.id)}
                    onCheckedChange={(checked) => edit(setCategoryIds)(checked === true ? [...categoryIds, c.id] : categoryIds.filter((id) => id !== c.id))}
                  />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums">{c.products}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {formError && (
          <p className="text-sm font-medium text-error" role="alert">
            {formError}
          </p>
        )}
        <ActionError error={previewAction.error} />
        <SubmitButton pending={previewAction.pending} pendingLabel="Calculando…">
          <Eye aria-hidden="true" /> Ver vista previa
        </SubmitButton>
      </form>

      <section aria-labelledby="vista-previa" aria-live="polite" className="min-w-0">
        <h2 id="vista-previa" className="sr-only">
          Vista previa
        </h2>
        {applied ? (
          <Alert variant="success">
            <CircleCheck aria-hidden="true" />
            <AlertTitle>
              {applied.changed === 1 ? "Se actualizó 1 precio" : `Se actualizaron ${applied.changed} precios`} en el borrador
            </AlertTitle>
            <AlertDescription>La carta pública sigue igual hasta que publiques. En el historial vas a ver la publicación como «Precios masivos».</AlertDescription>
            <AlertAction>
              {env.canPublish ? (
                <Button onClick={() => setPublishing(true)}>
                  <Send aria-hidden="true" /> Publicar ahora
                </Button>
              ) : (
                <span className="text-sm">Para publicar, avisale a alguien con permiso de publicación.</span>
              )}
              <Button asChild variant="outline">
                <Link href={`${env.base}/menus/${env.menuId}`}>Volver al editor</Link>
              </Button>
            </AlertAction>
          </Alert>
        ) : !data ? (
          <div className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-6 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Elegí el cambio y tocá «Ver vista previa». Vas a ver cada precio antes y después; nada se guarda hasta que lo confirmes, y la carta pública no
              cambia hasta que publiques.
            </p>
          </div>
        ) : data.total === 0 ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>Con esta regla ningún precio cambia. Probá con otro porcentaje, importe o redondeo.</AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-lg font-bold">
                {data.total === 1 ? "1 precio cambia" : `${data.total} precios cambian`}{" "}
                <span className="font-medium text-muted-foreground">
                  en {data.categories} {data.categories === 1 ? "categoría" : "categorías"}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{describeChange(preview.rule)}.</p>
              <p className="mt-3 flex items-start gap-2 text-sm">
                <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  Afecta a <strong>{joinNames(data.affectedBranches)}</strong>.
                  {data.keepsOwn.map((k) => (
                    <span key={k.branch} className="block text-muted-foreground">
                      En {k.branch}, {k.count === 1 ? "1 precio propio no cambia" : `${k.count} precios propios no cambian`}.
                    </span>
                  ))}
                </span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setConfirming(true)}>
                  Aplicar al borrador <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              <ActionError error={applyAction.error} className="mt-3" />
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Precios antes y después</caption>
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Producto
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Ahora
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Nuevo
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.changes.map((c) => (
                    <tr key={`${c.target}-${c.variantId ?? c.productId}`} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">
                          {c.productName}
                          {c.variantName ? ` · ${c.variantName}` : ""}
                        </span>
                        <span className="block text-[13px] text-muted-foreground">
                          {c.categoryName}
                          {c.keepsOwnPrice.length > 0 && ` · no cambia en ${joinNames(c.keepsOwnPrice.map((id) => branchName.get(id) ?? "otra sucursal"))} (precio propio)`}
                          {c.target.endsWith("_branch") && c.storedFrom === null && " · nuevo precio propio"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">{fmt(c.from)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{fmt(c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.truncated && (
                <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
                  Se muestran los primeros {data.changes.length} de {data.total}. Al aplicar se actualizan todos.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {preview && data && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={data.total === 1 ? "¿Aplicar 1 cambio de precio?" : `¿Aplicar ${data.total} cambios de precio?`}
          description={`Se guardan en el borrador de «${env.menuName}» (${describeChange(preview.rule).toLowerCase()}). La carta pública no cambia hasta que publiques.`}
          confirmLabel="Aplicar"
          pending={applyAction.pending}
          onConfirm={async () => {
            const r = await applyAction.run(env.menuId, preview.rule, data.fingerprint, idempotencyKey);
            setConfirming(false);
            if (r.ok) {
              setApplied({ changed: r.data.changed });
              setPreview(null);
              setIdempotencyKey(crypto.randomUUID());
            } else if (r.error.code === "bulk_preview_stale" || r.error.code === "price_conflict") {
              // Se recalcula para que la persona vea los precios actuales antes de decidir.
              const fresh = await previewAction.run(env.menuId, preview.rule);
              if (fresh.ok) setPreview({ data: fresh.data, rule: preview.rule });
            }
          }}
        />
      )}

      {publishing && (
        <PublishDialog
          menuId={env.menuId}
          menuName={env.menuName}
          base={env.base}
          appUrl={env.appUrl}
          branchSlugs={Object.fromEntries(env.branches.map((b) => [b.id, b.slug]))}
          accessibleBranchIds={env.branches.map((b) => b.id)}
          source="bulk_price"
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
