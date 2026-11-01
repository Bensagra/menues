"use client";

import { useState } from "react";
import { ArrowUpRight, MapPin, PencilLine, Plus, TriangleAlert } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { NativeSelect, TimezoneOptions } from "@/components/app/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/domain/text";
import { DEFAULT_TIMEZONE, hoursByDay, type OpeningInterval } from "@/domain/time";
import { useAction } from "@/hooks/use-action";
import { createBranchAction, updateBranchAction } from "@/server/actions/settings";
import { HoursEditor } from "./hours-editor";

export interface BranchRow {
  id: string;
  name: string;
  public_slug: string;
  timezone: string;
  address: string;
  phone: string;
  whatsapp: string;
  public_note: string;
  opening_hours: OpeningInterval[];
  is_active: boolean;
}

export function BranchesManager({
  businessId,
  businessSlug,
  branches,
  timezones,
  appUrl,
  limit,
  readOnly,
}: {
  businessId: string;
  businessSlug: string;
  branches: BranchRow[];
  timezones: string[];
  appUrl: string;
  limit: number;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<BranchRow | "new" | null>(null);
  const atLimit = branches.length >= limit;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {branches.length} de {limit} sucursales de tu plan.
        </p>
        {!readOnly && (
          <Button onClick={() => setEditing("new")} disabled={atLimit}>
            <Plus aria-hidden="true" /> Nueva sucursal
          </Button>
        )}
      </div>
      {atLimit && !readOnly && (
        <Alert variant="info">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>Llegaste al máximo de sucursales de tu plan. Escribinos para cambiar de plan.</AlertDescription>
        </Alert>
      )}
      <ul className="grid gap-3">
        {branches.map((branch) => {
          const days = hoursByDay(branch.opening_hours).filter((d) => d.ranges.length);
          return (
            <li key={branch.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 font-bold">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden="true" /> {branch.name}
                    {branch.is_active ? <Badge variant="success">Activa</Badge> : <Badge variant="muted">Inactiva</Badge>}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{branch.address || "Sin dirección cargada"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {days.length ? `Abre ${days.length} ${days.length === 1 ? "día" : "días"} por semana` : "Sin horarios cargados"} · {branch.timezone.replace(/_/g, " ")}
                  </p>
                  <a href={`${appUrl}/m/${branch.public_slug}`} target="_blank" rel="noopener" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    {appUrl.replace(/^https?:\/\//, "")}/m/{branch.public_slug} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
                {!readOnly && (
                  <Button variant="outline" onClick={() => setEditing(branch)}>
                    <PencilLine aria-hidden="true" /> Editar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editing && (
        <BranchDialog
          businessId={businessId}
          businessSlug={businessSlug}
          branch={editing === "new" ? null : editing}
          timezones={timezones}
          appUrl={appUrl}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function BranchDialog({
  businessId,
  businessSlug,
  branch,
  timezones,
  appUrl,
  onClose,
}: {
  businessId: string;
  businessSlug: string;
  branch: BranchRow | null;
  timezones: string[];
  appUrl: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? "");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [timezone, setTimezone] = useState(branch?.timezone ?? DEFAULT_TIMEZONE);
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(branch?.whatsapp ?? "");
  const [publicNote, setPublicNote] = useState(branch?.public_note ?? "");
  const [hours, setHours] = useState<OpeningInterval[]>(branch?.opening_hours ?? []);
  const [active, setActive] = useState(branch?.is_active ?? true);
  const create = useAction(createBranchAction);
  const update = useAction(updateBranchAction);
  const action = branch ? update : create;
  const effectiveSlug = slugEdited ? slug : slugify(`${businessSlug} ${name}`);
  const fieldErrors = action.fieldErrors;

  return (
    <Dialog open onOpenChange={(open) => !open && !action.pending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{branch ? `Editar ${branch.name}` : "Nueva sucursal"}</DialogTitle>
          <DialogDescription>Los datos públicos (dirección, teléfono, horarios) se ven en la carta de esta sucursal.</DialogDescription>
        </DialogHeader>
        <form
          id="branch-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const values = { name, timezone, address, phone, whatsapp, publicNote, openingHours: hours };
            const r = branch ? await update.run(branch.id, { ...values, isActive: active }) : await create.run(businessId, { ...values, publicSlug: effectiveSlug });
            if (r.ok) onClose();
          }}
        >
          <ActionError error={action.error && action.error.code !== "validation" ? action.error : null} />
          {action.error?.code === "validation" && fieldErrors.openingHours && <ActionError error={{ code: "validation", message: fieldErrors.openingHours }} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre" error={fieldErrors.name}>
              {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
            </FormField>
            <FormField label="Zona horaria" error={fieldErrors.timezone}>
              {(props) => (
                <NativeSelect {...props} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <TimezoneOptions zones={timezones} />
                </NativeSelect>
              )}
            </FormField>
          </div>
          {!branch ? (
            <FormField
              label="Dirección de la carta pública"
              hint={`Es permanente (la usa el QR): ${appUrl.replace(/^https?:\/\//, "")}/m/${effectiveSlug || "..."}`}
              error={fieldErrors.publicSlug}
            >
              {(props) => (
                <Input
                  {...props}
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                />
              )}
            </FormField>
          ) : (
            <p className="text-sm text-muted-foreground">
              Dirección pública (no se puede cambiar): {appUrl.replace(/^https?:\/\//, "")}/m/{branch.public_slug}
            </p>
          )}
          <FormField label="Dirección del local" optional error={fieldErrors.address}>
            {(props) => <Input {...props} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Teléfono" optional error={fieldErrors.phone}>
              {(props) => <Input {...props} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />}
            </FormField>
            <FormField label="WhatsApp" optional hint="Con código de país, por ejemplo 5491112345678." error={fieldErrors.whatsapp}>
              {(props) => <Input {...props} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" />}
            </FormField>
          </div>
          <FormField label="Aviso para clientes" optional hint="Por ejemplo, medios de pago o información sobre alergias." error={fieldErrors.publicNote}>
            {(props) => <Textarea {...props} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} maxLength={300} className="min-h-16" />}
          </FormField>
          <HoursEditor value={hours} onChange={setHours} />
          {branch && (
            <div className="grid gap-2">
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <span className="text-sm font-medium">Sucursal activa</span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
              {!active && branch.is_active && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Al desactivarla, su carta pública y su QR muestran «no disponible» hasta que la reactives. No se borra nada.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={action.pending}>
            Cancelar
          </Button>
          <SubmitButton form="branch-form" pending={action.pending} pendingLabel="Guardando…">
            {branch ? "Guardar" : "Crear sucursal"}
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
