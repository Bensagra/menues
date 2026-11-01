"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { NativeSelect, TimezoneOptions } from "@/components/app/native-select";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { CURRENCIES } from "@/domain/money";
import { slugify } from "@/domain/text";
import { DEFAULT_TIMEZONE } from "@/domain/time";
import { checkSlugAction, createBusinessAction } from "@/server/actions/onboarding";

function useSlugCheck(kind: "business" | "branch", value: string) {
  const [result, setResult] = useState<{ value: string; state: "available" | "taken" | "invalid" | "idle" } | null>(null);
  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await checkSlugAction(kind, value);
      if (cancelled) return;
      setResult({ value, state: !r.ok ? "idle" : !r.data.valid ? "invalid" : r.data.available ? "available" : "taken" });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, value]);
  if (!value) return "idle" as const;
  if (!result || result.value !== value) return "checking" as const;
  return result.state;
}

function SlugStatus({ state }: { state: ReturnType<typeof useSlugCheck> }) {
  if (state === "available")
    return (
      <span className="flex items-center gap-1 text-[13px] font-medium text-success" role="status">
        <CircleCheck className="size-3.5" aria-hidden="true" /> Disponible
      </span>
    );
  if (state === "taken" || state === "invalid")
    return (
      <span className="flex items-center gap-1 text-[13px] font-medium text-error" role="status">
        <CircleX className="size-3.5" aria-hidden="true" /> {state === "taken" ? "Ya está en uso" : "Formato no válido"}
      </span>
    );
  if (state === "checking") return <span className="text-[13px] text-muted-foreground" role="status">Verificando…</span>;
  return null;
}

export function BusinessForm({ appUrl, timezones }: { appUrl: string; timezones: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [currency, setCurrency] = useState("ARS");
  const [branchName, setBranchName] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [branchSlugEdited, setBranchSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [address, setAddress] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const { run, pending, error, fieldErrors } = useAction(createBusinessAction);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const effectiveBranchSlug = branchSlugEdited ? branchSlug : slugify(`${name} ${branchName}`);
  const businessSlugState = useSlugCheck("business", effectiveSlug);
  const branchSlugState = useSlugCheck("branch", effectiveBranchSlug);
  const host = appUrl.replace(/^https?:\/\//, "");

  return (
    <form
      noValidate
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run({
          name,
          slug: effectiveSlug,
          currency,
          branchName,
          branchSlug: effectiveBranchSlug,
          timezone,
          address,
          websiteUrl,
        });
        if (result.ok) {
          router.push(`/bienvenida/carga?negocio=${encodeURIComponent(result.data.businessSlug)}`);
        }
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-base font-bold">Tu negocio</legend>
        <FormField label="Nombre del negocio" error={fieldErrors.name}>
          {(props) => <Input {...props} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField
          label="Identificador del panel"
          hint={`Se usa en la dirección de tu panel: ${host}/panel/${effectiveSlug || "tu-negocio"}`}
          error={fieldErrors.slug}
        >
          {(props) => (
            <div className="grid gap-1">
              <Input
                {...props}
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value.toLowerCase());
                }}
              />
              <SlugStatus state={businessSlugState} />
            </div>
          )}
        </FormField>
        <FormField
          label="Sitio web del local"
          optional
          hint="Lo usamos para armarte un diseño de carta con los colores y la letra de tu local. Instagram y Facebook no se pueden leer sin iniciar sesión."
          error={fieldErrors.websiteUrl}
        >
          {(props) => (
            <Input
              {...props}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="milocal.com.ar"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Moneda de los precios" error={fieldErrors.currency}>
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
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-base font-bold">Tu primera sucursal</legend>
        <p className="-mt-2 text-sm text-muted-foreground">Cada sucursal tiene su carta pública y su QR. Podés agregar más después.</p>
        <FormField label="Nombre de la sucursal" hint="Por ejemplo, el barrio: Palermo." error={fieldErrors.branchName}>
          {(props) => <Input {...props} value={branchName} onChange={(e) => setBranchName(e.target.value)} />}
        </FormField>
        <FormField
          label="Dirección de la carta pública"
          hint={`Es la dirección permanente del QR y no se puede cambiar después: ${host}/m/${effectiveBranchSlug || "tu-local"}`}
          error={fieldErrors.branchSlug}
        >
          {(props) => (
            <div className="grid gap-1">
              <Input
                {...props}
                value={effectiveBranchSlug}
                onChange={(e) => {
                  setBranchSlugEdited(true);
                  setBranchSlug(e.target.value.toLowerCase());
                }}
              />
              <SlugStatus state={branchSlugState} />
            </div>
          )}
        </FormField>
        <FormField label="Dirección del local" optional error={fieldErrors.address}>
          {(props) => <Input {...props} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />}
        </FormField>
        <FormField label="Zona horaria" hint="Se usa para horarios y promociones." error={fieldErrors.timezone}>
          {(props) => (
            <NativeSelect {...props} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <TimezoneOptions zones={timezones} />
            </NativeSelect>
          )}
        </FormField>
      </fieldset>

      <SubmitButton pending={pending} pendingLabel="Creando tu negocio…" size="lg" className="w-full sm:w-auto">
        Crear negocio y seguir
      </SubmitButton>
    </form>
  );
}
