"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Store, Trash2, TriangleAlert } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { MoneyInput } from "@/components/app/money-input";
import { NativeSelect } from "@/components/app/native-select";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { publicMediaUrl } from "@/lib/media-url";
import { PRODUCT_STATUS_LABELS, PRODUCT_TAGS, type ProductStatus, type ProductTag } from "@/domain/snapshot";
import { saveProductAction } from "@/server/actions/catalog";
import { ImageField } from "./image-field";
import type { EditorCategory, EditorEnv, EditorProduct } from "./types";

interface Line {
  key: string;
  id: string | null;
  name: string;
  priceMinor: number | null;
  priceError: string | null;
}

interface FormState {
  categoryId: string;
  name: string;
  description: string;
  priceMinor: number | null;
  priceError: string | null;
  status: ProductStatus;
  tags: ProductTag[];
  imageMediaId: string | null;
  imagePreview: string | null;
  hasVariants: boolean;
  variants: Line[];
  extras: Line[];
}

/** Multisucursal: qué locales ven el precio general y cuáles tienen precio propio. */
function AffectedBranches({ env, product, hasVariants }: { env: EditorEnv; product: EditorProduct | null; hasVariants: boolean }) {
  const own = new Set(
    hasVariants
      ? (product?.variantPrices ?? []).map((v) => v.branch_id)
      : (product?.overrides ?? []).filter((o) => o.price_minor !== null).map((o) => o.branch_id),
  );
  const names = (list: { name: string }[]) =>
    list.length <= 1 ? list.map((b) => b.name).join("") : `${list.slice(0, -1).map((b) => b.name).join(", ")} y ${list[list.length - 1].name}`;
  const general = env.branches.filter((b) => !own.has(b.id));
  const withOwn = env.branches.filter((b) => own.has(b.id));
  return (
    <p className="flex items-start gap-2 rounded-lg bg-info-surface px-3 py-2 text-[13px] text-info">
      <Store className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {general.length > 0 ? `Este precio se muestra en ${names(general)}.` : "Todas las sucursales tienen precio propio para este producto."}
        {withOwn.length > 0 && ` ${names(withOwn)} ${withOwn.length === 1 ? "tiene" : "tienen"} precio propio y no cambia${withOwn.length === 1 ? "" : "n"} desde acá (se edita en «Precios por sucursal»).`}
      </span>
    </p>
  );
}

let lineCounter = 0;
const newKey = () => `line-${++lineCounter}`;

function initialState(product: EditorProduct | null, categoryId: string): FormState {
  return {
    categoryId: product?.category_id ?? categoryId,
    name: product?.name ?? "",
    description: product?.description ?? "",
    priceMinor: product?.price_minor ?? null,
    priceError: null,
    status: product?.status ?? "available",
    tags: (product?.tags ?? []) as ProductTag[],
    imageMediaId: product?.image_media_id ?? null,
    imagePreview: product?.image ? publicMediaUrl(product.image.sm) : null,
    hasVariants: (product?.variants.length ?? 0) > 0,
    variants: (product?.variants ?? []).map((v) => ({ key: newKey(), id: v.id, name: v.name, priceMinor: v.price_minor, priceError: null })),
    extras: (product?.extras ?? []).map((e) => ({ key: newKey(), id: e.id, name: e.name, priceMinor: e.price_minor, priceError: null })),
  };
}

function comparable(state: FormState) {
  return JSON.stringify({
    ...state,
    priceError: undefined,
    imagePreview: undefined,
    variants: state.hasVariants ? state.variants.map(({ id, name, priceMinor }) => ({ id, name, priceMinor })) : [],
    extras: state.extras.map(({ id, name, priceMinor }) => ({ id, name, priceMinor })),
  });
}

export function ProductSheet({
  env,
  product,
  defaultCategoryId,
  categories,
  onClose,
}: {
  env: EditorEnv;
  product: EditorProduct | null;
  defaultCategoryId: string;
  categories: EditorCategory[];
  onClose: () => void;
}) {
  const initial = useMemo(() => initialState(product, defaultCategoryId), [product, defaultCategoryId]);
  const [state, setState] = useState<FormState>(initial);
  const [confirmClose, setConfirmClose] = useState(false);
  const [expectedRevision, setExpectedRevision] = useState<number | null>(product?.revision ?? null);
  const [baseline, setBaseline] = useState(() => comparable(initial));
  const { run, pending, error, fieldErrors, reset } = useAction(saveProductAction);
  const dirty = comparable(state) !== baseline;
  const readOnly = env.readOnly || !env.canEditContent;
  useUnsavedChanges(dirty && !readOnly);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));
  const updateLine = (list: "variants" | "extras", key: string, patch: Partial<Line>) =>
    setState((s) => ({ ...s, [list]: s[list].map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const moveLine = (list: "variants" | "extras", index: number, delta: number) =>
    setState((s) => {
      const items = [...s[list]];
      const target = index + delta;
      if (target < 0 || target >= items.length) return s;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...s, [list]: items };
    });

  const conflict = error?.code === "revision_conflict";
  const lineError = (list: string, index: number, field: string) => fieldErrors[`${list}.${index}.${field}`];

  async function save(overrideRevision?: number | null) {
    const hasLineErrors = [...state.variants, ...state.extras].some((l) => l.priceError) || Boolean(state.priceError);
    if (hasLineErrors) return;
    const r = await run({
      id: product?.id ?? null,
      menuId: env.menuId,
      categoryId: state.categoryId,
      expectedRevision: overrideRevision !== undefined ? overrideRevision : expectedRevision,
      name: state.name,
      description: state.description,
      priceMinor: state.hasVariants ? null : state.priceMinor,
      status: state.status,
      tags: state.tags,
      imageMediaId: state.imageMediaId,
      variants: state.hasVariants ? state.variants.map((v) => ({ id: v.id, name: v.name, priceMinor: v.priceMinor })) : [],
      extras: state.extras.map((e) => ({ id: e.id, name: e.name, priceMinor: e.priceMinor ?? 0 })),
    });
    if (r.ok) {
      setBaseline(comparable(state));
      onClose();
    }
  }

  const requestClose = () => (dirty && !readOnly ? setConfirmClose(true) : onClose());

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && requestClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>{product ? "Editar producto" : "Nuevo producto"}</SheetTitle>
            <SheetDescription>
              Los cambios se guardan en el borrador. Tus clientes los ven cuando publicás.
            </SheetDescription>
          </SheetHeader>

          <form
            id="product-form"
            noValidate
            className="grid flex-1 gap-6 overflow-y-auto p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {readOnly && (
              <Alert variant="info">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  {env.readOnly
                    ? "La cuenta está en modo de solo lectura."
                    : "Esta carta se usa en sucursales a las que no tenés acceso: no podés cambiar su contenido compartido."}
                </AlertDescription>
              </Alert>
            )}

            {conflict ? (
              <Alert variant="warning">
                <RefreshCw aria-hidden="true" />
                <AlertTitle>Otra persona modificó este producto</AlertTitle>
                <AlertDescription>
                  Mientras lo editabas se guardó otra versión. Podés cerrar para ver la versión actual o sobrescribirla con tus cambios.
                </AlertDescription>
                <AlertAction>
                  <Button type="button" variant="outline" size="sm" onClick={onClose}>
                    Ver la versión actual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const current = Number(error?.detail);
                      setExpectedRevision(Number.isFinite(current) ? current : null);
                      reset();
                      void save(Number.isFinite(current) ? current : null);
                    }}
                  >
                    Sobrescribir con mis cambios
                  </Button>
                </AlertAction>
              </Alert>
            ) : (
              <ActionError error={error && error.code !== "validation" ? error : null} />
            )}

            <fieldset disabled={readOnly || pending} className="grid gap-4">
              <FormField label="Nombre" error={fieldErrors.name}>
                {(props) => <Input {...props} value={state.name} onChange={(e) => set("name", e.target.value)} autoFocus={!product} />}
              </FormField>
              <FormField label="Descripción" optional error={fieldErrors.description}>
                {(props) => (
                  <Textarea {...props} value={state.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" maxLength={600} />
                )}
              </FormField>
              <FormField label="Categoría" error={fieldErrors.categoryId}>
                {(props) => (
                  <NativeSelect {...props} value={state.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </fieldset>

            <fieldset disabled={readOnly || pending} className="grid gap-4">
              <legend className="mb-1 text-base font-bold">Precio</legend>
              {env.branches.length > 1 && <AffectedBranches env={env} product={product} hasVariants={state.hasVariants} />}
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <span className="text-sm font-medium">Tiene variantes (tamaños o presentaciones)</span>
                <Switch
                  checked={state.hasVariants}
                  onCheckedChange={(checked) =>
                    setState((s) => ({
                      ...s,
                      hasVariants: checked,
                      variants: checked && s.variants.length === 0 ? [{ key: newKey(), id: null, name: "", priceMinor: s.priceMinor, priceError: null }] : s.variants,
                    }))
                  }
                />
              </label>
              {!state.hasVariants ? (
                <FormField label="Precio" optional hint="Si lo dejás vacío, la carta muestra el producto sin precio." error={state.priceError ?? fieldErrors.priceMinor}>
                  {(props) => (
                    <MoneyInput
                      {...props}
                      value={state.priceMinor}
                      currency={env.currency}
                      locale={env.locale}
                      onValueChange={(minor, err) => setState((s) => ({ ...s, priceMinor: minor, priceError: err }))}
                    />
                  )}
                </FormField>
              ) : (
                <div className="grid gap-3">
                  {state.variants.map((line, index) => (
                    <div key={line.key} className="grid grid-cols-[1fr_9rem_auto] items-start gap-2">
                      <FormField label={`Variante ${index + 1}`} error={lineError("variants", index, "name")}>
                        {(props) => (
                          <Input {...props} placeholder="Chica" value={line.name} onChange={(e) => updateLine("variants", line.key, { name: e.target.value })} />
                        )}
                      </FormField>
                      <FormField label="Precio" error={line.priceError ?? undefined}>
                        {(props) => (
                          <MoneyInput
                            {...props}
                            value={line.priceMinor}
                            currency={env.currency}
                            locale={env.locale}
                            onValueChange={(minor, err) => updateLine("variants", line.key, { priceMinor: minor, priceError: err })}
                          />
                        )}
                      </FormField>
                      <LineActions
                        index={index}
                        count={state.variants.length}
                        label={line.name || `variante ${index + 1}`}
                        onMove={(d) => moveLine("variants", index, d)}
                        onRemove={() => setState((s) => ({ ...s, variants: s.variants.filter((l) => l.key !== line.key) }))}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={() => setState((s) => ({ ...s, variants: [...s.variants, { key: newKey(), id: null, name: "", priceMinor: null, priceError: null }] }))}
                  >
                    <Plus aria-hidden="true" /> Agregar variante
                  </Button>
                  {fieldErrors.variants && <p className="text-[13px] font-medium text-error">{fieldErrors.variants}</p>}
                </div>
              )}
            </fieldset>

            <fieldset disabled={readOnly || pending} className="grid gap-3">
              <legend className="mb-1 text-base font-bold">Extras</legend>
              <p className="-mt-2 text-sm text-muted-foreground">Agregados con costo adicional, por ejemplo «Doble queso».</p>
              {state.extras.map((line, index) => (
                <div key={line.key} className="grid grid-cols-[1fr_9rem_auto] items-start gap-2">
                  <FormField label={`Extra ${index + 1}`} error={lineError("extras", index, "name")}>
                    {(props) => <Input {...props} value={line.name} onChange={(e) => updateLine("extras", line.key, { name: e.target.value })} />}
                  </FormField>
                  <FormField label="Precio adicional" error={line.priceError ?? undefined}>
                    {(props) => (
                      <MoneyInput
                        {...props}
                        value={line.priceMinor}
                        allowEmpty={false}
                        currency={env.currency}
                        locale={env.locale}
                        onValueChange={(minor, err) => updateLine("extras", line.key, { priceMinor: minor, priceError: err })}
                      />
                    )}
                  </FormField>
                  <LineActions
                    index={index}
                    count={state.extras.length}
                    label={line.name || `extra ${index + 1}`}
                    onMove={(d) => moveLine("extras", index, d)}
                    onRemove={() => setState((s) => ({ ...s, extras: s.extras.filter((l) => l.key !== line.key) }))}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => setState((s) => ({ ...s, extras: [...s.extras, { key: newKey(), id: null, name: "", priceMinor: null, priceError: null }] }))}
              >
                <Plus aria-hidden="true" /> Agregar extra
              </Button>
            </fieldset>

            <fieldset disabled={readOnly || pending} className="grid gap-2">
              <legend className="mb-1 text-base font-bold">Disponibilidad</legend>
              <RadioGroup value={state.status} onValueChange={(v) => set("status", v as ProductStatus)} className="grid gap-1">
                {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((status) => (
                  <label key={status} className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value={status} />
                    <span>
                      <span className="font-medium">{PRODUCT_STATUS_LABELS[status]}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {status === "available" && "Se muestra con su precio."}
                        {status === "sold_out" && "Se muestra marcado como agotado."}
                        {status === "hidden" && "No aparece en la carta pública."}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset disabled={readOnly || pending} className="grid gap-2">
              <legend className="mb-1 text-base font-bold">Etiquetas</legend>
              <p className="-mt-1 text-sm text-muted-foreground">
                Marcá solo lo que confirmaste vos. CartaLista nunca agrega etiquetas ni alérgenos por su cuenta.
              </p>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {(Object.keys(PRODUCT_TAGS) as ProductTag[]).map((tag) => (
                  <label key={tag} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={state.tags.includes(tag)}
                      onCheckedChange={(checked) => set("tags", checked ? [...state.tags, tag] : state.tags.filter((t) => t !== tag))}
                    />
                    {PRODUCT_TAGS[tag]}
                  </label>
                ))}
              </div>
            </fieldset>

            <ImageField
              businessId={env.businessId}
              label="Foto"
              disabled={readOnly || pending}
              previewUrl={state.imagePreview}
              onChange={(image) => setState((s) => ({ ...s, imageMediaId: image?.mediaId ?? null, imagePreview: image?.previewUrl ?? null }))}
            />
          </form>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={requestClose} disabled={pending}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <SubmitButton form="product-form" pending={pending} pendingLabel="Guardando…" disabled={!dirty && Boolean(product)}>
                Guardar borrador
              </SubmitButton>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="¿Descartar los cambios?"
        description="Tenés cambios sin guardar en este producto. Si cerrás ahora, se pierden."
        confirmLabel="Descartar cambios"
        cancelLabel="Seguir editando"
        destructive
        onConfirm={() => {
          setConfirmClose(false);
          setBaseline(comparable(state));
          onClose();
        }}
      />
    </>
  );
}

function LineActions({
  index,
  count,
  label,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex pt-7">
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Subir ${label}`}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Bajar ${label}`}>
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Quitar ${label}`}>
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
