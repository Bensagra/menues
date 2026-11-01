"use client";

import { useState } from "react";
import { cn } from "cn";
import { Check, CircleAlert, CircleCheck } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { NativeSelect } from "@/components/app/native-select";
import { ImageField } from "@/components/editor/image-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRAND_PRESETS, contrastRatio, isLegibleBrandColor, MENU_BACKGROUND } from "@/domain/contrast";
import { CURRENCIES } from "@/domain/money";
import { useAction } from "@/hooks/use-action";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { setBusinessMediaAction, updateBusinessAction } from "@/server/actions/settings";

interface BusinessValues {
  id: string;
  name: string;
  description: string;
  currency: string;
  locale: string;
  brand_color: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
}

export function BusinessSettingsForm({ business, hasPrices, readOnly }: { business: BusinessValues; hasPrices: boolean; readOnly: boolean }) {
  const [name, setName] = useState(business.name);
  const [description, setDescription] = useState(business.description);
  const [currency, setCurrency] = useState(business.currency);
  const [color, setColor] = useState((business.brand_color ?? "").toUpperCase());
  const [logo, setLogo] = useState(business.logoUrl);
  const [cover, setCover] = useState(business.coverUrl);
  const [saved, setSaved] = useState(false);
  const save = useAction(updateBusinessAction);
  const media = useAction(setBusinessMediaAction);
  const dirty = name !== business.name || description !== business.description || currency !== business.currency || color !== (business.brand_color ?? "").toUpperCase();
  useUnsavedChanges(dirty && !readOnly);

  const validHex = /^#[0-9A-F]{6}$/.test(color);
  const legible = color === "" || (validHex && isLegibleBrandColor(color));
  const effective = color && validHex && legible ? color : "#214E3B";
  const onWhite = validHex ? contrastRatio(color, "#FFFFFF") : null;
  const onBg = validHex ? contrastRatio(color, MENU_BACKGROUND) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form
        className="grid content-start gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaved(false);
          const r = await save.run(business.id, { name, description, brandColor: color, currency, locale: business.locale });
          if (r.ok) setSaved(true);
        }}
      >
        <fieldset disabled={readOnly || save.pending} className="grid gap-4">
          <ActionError error={save.error && save.error.code !== "validation" ? save.error : null} />
          {saved && !dirty && (
            <Alert variant="success">
              <CircleCheck aria-hidden="true" />
              <AlertDescription>Guardaste los datos del local. La carta pública ya muestra los cambios.</AlertDescription>
            </Alert>
          )}
          <FormField label="Nombre del negocio" error={save.fieldErrors.name}>
            {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <FormField label="Descripción breve" optional hint="Se muestra debajo del nombre en la carta." error={save.fieldErrors.description}>
            {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-16" />}
          </FormField>
          <FormField
            label="Moneda"
            hint={hasPrices ? "Con precios cargados solo podés cambiar a monedas con la misma cantidad de decimales." : undefined}
            error={save.fieldErrors.currency}
          >
            {(props) => (
              <NativeSelect {...props} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {Object.entries(CURRENCIES).map(([code, meta]) => (
                  <option key={code} value={code}>
                    {meta.label} ({code})
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-semibold">Color de la carta</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colores sugeridos">
              {BRAND_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  role="radio"
                  aria-checked={color === preset.value}
                  aria-label={preset.name}
                  onClick={() => setColor(preset.value)}
                  className={cn("flex size-11 items-center justify-center rounded-lg border-2", color === preset.value ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: preset.value }}
                >
                  {color === preset.value && <Check className="size-5 text-white" aria-hidden="true" />}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={color === ""}
                onClick={() => setColor("")}
                className={cn("min-h-11 rounded-lg border-2 px-3 text-sm font-semibold", color === "" ? "border-foreground" : "border-border")}
              >
                Predeterminado
              </button>
            </div>
            <FormField
              label="Color personalizado (hex)"
              optional
              error={!legible ? "Ese color no tiene contraste suficiente con el texto. Elegí uno más oscuro." : save.fieldErrors.brandColor}
              hint={validHex && legible ? `Contraste: ${onWhite?.toFixed(1)}:1 con blanco y ${onBg?.toFixed(1)}:1 sobre el fondo. Cumple AA.` : undefined}
            >
              {(props) => (
                <div className="flex gap-2">
                  <Input {...props} value={color} placeholder="#214E3B" onChange={(e) => setColor(e.target.value.toUpperCase())} className="font-mono" maxLength={7} />
                  <input
                    type="color"
                    aria-label="Elegir color"
                    value={validHex ? color : "#214E3B"}
                    onChange={(e) => setColor(e.target.value.toUpperCase())}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-input bg-card"
                  />
                </div>
              )}
            </FormField>
          </fieldset>

          <SubmitButton pending={save.pending} pendingLabel="Guardando…" disabled={!dirty || !legible} className="justify-self-start">
            Guardar cambios
          </SubmitButton>
        </fieldset>

        <div className="grid gap-6 border-t border-border pt-6">
          <ImageField
            businessId={business.id}
            kind="logo"
            label="Logo"
            aspect="aspect-square"
            disabled={readOnly || media.pending}
            previewUrl={logo}
            onChange={async (image) => {
              const r = await media.run(business.id, "logo", image?.mediaId ?? null);
              if (r.ok) setLogo(image?.previewUrl ?? null);
            }}
          />
          <ImageField
            businessId={business.id}
            kind="cover"
            label="Portada"
            aspect="aspect-[16/7]"
            disabled={readOnly || media.pending}
            previewUrl={cover}
            onChange={async (image) => {
              const r = await media.run(business.id, "cover", image?.mediaId ?? null);
              if (r.ok) setCover(image?.previewUrl ?? null);
            }}
          />
          <ActionError error={media.error} />
          <p className="text-[13px] text-muted-foreground">El logo y la portada se publican en cuanto los guardás.</p>
        </div>
      </form>

      <aside aria-label="Vista previa de la carta" className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-semibold">Vista previa</p>
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="h-1.5" style={{ backgroundColor: effective }} />
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="aspect-[16/7] w-full object-cover" />
          )}
          <div className="p-4">
            <div className="flex items-center gap-3">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-12 rounded-lg border border-border bg-card object-contain" />
              )}
              <p className="font-display text-2xl font-semibold" style={{ color: effective }}>
                {name || "Tu negocio"}
              </p>
            </div>
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
            <p className="mt-4 font-display text-lg font-semibold" style={{ color: effective }}>
              Entradas
            </p>
            <div className="mt-2 border-b border-dashed border-border pb-2">
              <p className="font-semibold">Provoleta</p>
              <p className="price text-sm">$ 9.800</p>
            </div>
          </div>
        </div>
        {!legible && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-error">
            <CircleAlert className="size-4" aria-hidden="true" /> La vista previa usa el color predeterminado hasta que elijas uno legible.
          </p>
        )}
      </aside>
    </div>
  );
}
