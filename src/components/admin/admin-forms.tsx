"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck, Link2, OctagonAlert, Plus, RotateCw } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { NativeSelect, TimezoneOptions } from "@/components/app/native-select";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES } from "@/domain/money";
import { slugify } from "@/domain/text";
import { DEFAULT_TIMEZONE } from "@/domain/time";
import { useAction } from "@/hooks/use-action";
import {
  adminAssignPlanAction,
  adminBusinessImpactAction,
  adminCreateBusinessAction,
  adminInviteOwnerAction,
  adminRetryImportAction,
  adminSavePlanAction,
  adminSetBusinessStatusAction,
} from "@/server/actions/admin";

function LinkResult({ link, title }: { link: string; title: string }) {
  return (
    <Alert variant="success">
      <Link2 aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        Compartí este enlace con la persona invitada. Vence en 14 días, sirve una sola vez y no se vuelve a mostrar.
        <code className="mt-2 block rounded-md bg-card px-3 py-2 text-sm break-all text-foreground">{link}</code>
      </AlertDescription>
      <AlertAction>
        <CopyButton value={link} />
      </AlertAction>
    </Alert>
  );
}

export function CreateBusinessButton({ plans, timezones }: { plans: { id: string; name: string; is_default: boolean }[]; timezones: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [branchName, setBranchName] = useState("Principal");
  const [currency, setCurrency] = useState("ARS");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [planId, setPlanId] = useState(plans.find((p) => p.is_default)?.id ?? plans[0]?.id ?? "");
  const [result, setResult] = useState<{ link: string; businessId: string } | null>(null);
  const { run, pending, error, fieldErrors } = useAction(adminCreateBusinessAction);
  const slug = slugify(name);
  const branchSlug = slugify(`${name} ${branchName}`);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> Nuevo negocio
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo negocio</DialogTitle>
            <DialogDescription>Se crea el negocio con su primera sucursal y una invitación para el propietario.</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="grid gap-4">
              <LinkResult link={result.link} title="Negocio creado" />
              <DialogFooter>
                <Button
                  onClick={() => {
                    setOpen(false);
                    router.push(`/admin/negocios/${result.businessId}`);
                  }}
                >
                  Ver el negocio
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <form
                id="admin-business"
                className="grid gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run({ name, slug, currency, branchName, branchSlug, timezone, ownerEmail, planId: planId || null });
                  if (r.ok) setResult(r.data);
                }}
              >
                <ActionError error={error && error.code !== "validation" ? error : null} />
                <FormField label="Nombre del negocio" hint={slug ? `Identificador: ${slug}` : undefined} error={fieldErrors.name ?? fieldErrors.slug}>
                  {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
                </FormField>
                <FormField label="Primera sucursal" hint={branchSlug ? `Carta pública: /m/${branchSlug}` : undefined} error={fieldErrors.branchName ?? fieldErrors.branchSlug}>
                  {(props) => <Input {...props} value={branchName} onChange={(e) => setBranchName(e.target.value)} />}
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Moneda">
                    {(props) => (
                      <NativeSelect {...props} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        {Object.entries(CURRENCIES).map(([code]) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </FormField>
                  <FormField label="Plan">
                    {(props) => (
                      <NativeSelect {...props} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </FormField>
                </div>
                <FormField label="Zona horaria">
                  {(props) => (
                    <NativeSelect {...props} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      <TimezoneOptions zones={timezones} />
                    </NativeSelect>
                  )}
                </FormField>
                <FormField label="Email del propietario" error={fieldErrors.ownerEmail}>
                  {(props) => <Input {...props} type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />}
                </FormField>
              </form>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                  Cancelar
                </Button>
                <SubmitButton form="admin-business" pending={pending} pendingLabel="Creando…">
                  Crear negocio
                </SubmitButton>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BusinessStatusControl({ businessId, businessName, status }: { businessId: string; businessName: string; status: "active" | "suspended" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const impact = useAction(adminBusinessImpactAction);
  const change = useAction(adminSetBusinessStatusAction);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminBusinessImpactAction>> | null>(null);
  const suspending = status === "active";
  const result = data && data.ok ? data.data : null;
  return (
    <>
      <SubmitButton
        type="button"
        variant={suspending ? "destructive-outline" : "default"}
        pending={impact.pending}
        onClick={async () => {
          const r = await impact.run(businessId);
          setData(r);
          setOpen(true);
        }}
      >
        {suspending ? "Suspender cuenta" : "Reactivar cuenta"}
      </SubmitButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={suspending ? `¿Suspender ${businessName}?` : `¿Reactivar ${businessName}?`}
        description={
          suspending ? (
            <div className="grid gap-2">
              <p>Esto es lo que pasa en cuanto confirmes:</p>
              <ul className="list-disc pl-5">
                <li>
                  La carta pública de {result?.public_branches.length ?? 0} {result?.public_branches.length === 1 ? "sucursal" : "sucursales"} (
                  {result?.public_branches.map((b) => b.name).join(", ") || "ninguna"}) muestra «Esta carta no está disponible». Los QR siguen apuntando al mismo
                  lugar.
                </li>
                <li>{result?.members ?? 0} personas del equipo pueden entrar, pero en modo de solo lectura.</li>
                <li>{result?.queued_imports ?? 0} importaciones en cola quedan en espera hasta que se reactive.</li>
                <li>No se borra ningún dato. Reactivar restablece todo.</li>
              </ul>
            </div>
          ) : (
            "La carta pública vuelve a mostrarse con su última versión publicada y el equipo recupera sus permisos."
          )
        }
        confirmLabel={suspending ? "Suspender" : "Reactivar"}
        destructive={suspending}
        pending={change.pending}
        confirmDisabled={suspending && reason.trim().length < 3}
        onConfirm={async () => {
          const r = await change.run(businessId, suspending ? "suspended" : "active", reason);
          if (r.ok) setOpen(false);
        }}
      >
        {suspending && (
          <FormField label="Motivo (lo ve el equipo del negocio)">
            {(props) => <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" maxLength={300} />}
          </FormField>
        )}
        <ActionError error={change.error ?? (data && !data.ok ? data.error : null)} />
      </ConfirmDialog>
    </>
  );
}

export function AssignPlanForm({ businessId, plans, currentPlanId }: { businessId: string; plans: { id: string; name: string }[]; currentPlanId: string | null }) {
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const { run, pending, error } = useAction(adminAssignPlanAction);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        const r = await run(businessId, planId, note);
        if (r.ok) setSaved(true);
      }}
    >
      <FormField label="Plan">
        {(props) => (
          <NativeSelect {...props} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label="Nota" optional>
        {(props) => <Input {...props} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por ejemplo: acuerdo comercial" />}
      </FormField>
      <ActionError error={error} />
      {saved && (
        <p className="flex items-center gap-1.5 text-sm text-success" role="status">
          <CircleCheck className="size-4" aria-hidden="true" /> Plan asignado.
        </p>
      )}
      <SubmitButton pending={pending} disabled={planId === currentPlanId} className="justify-self-start">
        Asignar plan
      </SubmitButton>
    </form>
  );
}

export function InviteOwnerForm({ businessId }: { businessId: string }) {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const { run, pending, error, fieldErrors } = useAction(adminInviteOwnerAction);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(businessId, email);
        if (r.ok) setLink(r.data.link);
      }}
    >
      {link && <LinkResult link={link} title="Invitación de propietario creada" />}
      <FormField label="Email del propietario" error={fieldErrors._}>
        {(props) => <Input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </FormField>
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <SubmitButton pending={pending} className="justify-self-start">
        Invitar propietario
      </SubmitButton>
    </form>
  );
}

const IMPORT_STATUS_TEXT: Record<string, string> = {
  pending: "pendiente",
  processing: "procesando",
  needs_review: "en revisión",
  completed: "completado",
  cancelled: "cancelado",
};

/**
 * Reintento idempotente: si el trabajo ya no está fallido, no se vuelve a encolar.
 * La confirmación queda en la URL (?reintentado=) porque la fila cambia de estado
 * o sale del filtro al refrescarse.
 */
export function RetryImportAdminButton({ importId }: { importId: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction(adminRetryImportAction);
  const [result, setResult] = useState<{ requeued: boolean; status: string } | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <SubmitButton
        type="button"
        size="sm"
        variant="outline"
        pending={pending}
        disabled={Boolean(result)}
        onClick={async () => {
          const r = await run(importId);
          if (!r.ok) return;
          setResult(r.data);
          const url = new URL(window.location.href);
          url.searchParams.set("reintentado", importId);
          router.replace(`${url.pathname}${url.search}`, { scroll: false });
        }}
      >
        <RotateCw aria-hidden="true" /> {result?.requeued ? "En cola de nuevo" : "Reintentar"}
      </SubmitButton>
      {result && !result.requeued && (
        <span className="text-[13px] text-muted-foreground" role="status">
          No hacía falta: el trabajo ya está {IMPORT_STATUS_TEXT[result.status] ?? result.status}.
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-[13px] text-error">
          <OctagonAlert className="size-3.5" aria-hidden="true" /> {error.message}
        </span>
      )}
    </span>
  );
}

export interface PlanRow {
  id: string | null;
  code: string;
  name: string;
  description: string;
  max_branches: number;
  max_members: number;
  max_menus: number;
  ai_pages_per_month: number;
  ai_max_pages_per_import: number;
  is_active: boolean;
  is_default?: boolean;
}

export function PlanDialog({ plan, onClose }: { plan: PlanRow; onClose: () => void }) {
  const [values, setValues] = useState(plan);
  const { run, pending, error, fieldErrors } = useAction(adminSavePlanAction);
  const num = (key: keyof PlanRow, label: string) => (
    <FormField label={label} error={fieldErrors[key as string]}>
      {(props) => (
        <Input
          {...props}
          type="number"
          inputMode="numeric"
          min={0}
          value={String(values[key] ?? "")}
          onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
          className="tabular-nums"
        />
      )}
    </FormField>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan.id ? `Editar plan ${plan.name}` : "Nuevo plan"}</DialogTitle>
          <DialogDescription>Los cambios de límites aplican de inmediato a los negocios con este plan.</DialogDescription>
        </DialogHeader>
        <form
          id="plan-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const { is_default: _ignored, ...payload } = values;
            void _ignored;
            const r = await run(payload);
            if (r.ok) onClose();
          }}
        >
          <ActionError error={error && error.code !== "validation" ? error : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre" error={fieldErrors.name}>
              {(props) => <Input {...props} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />}
            </FormField>
            <FormField label="Código" hint="No se puede cambiar después." error={fieldErrors.code}>
              {(props) => <Input {...props} value={values.code} disabled={Boolean(plan.id)} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))} />}
            </FormField>
          </div>
          <FormField label="Descripción" optional>
            {(props) => <Textarea {...props} value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} className="min-h-16" />}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            {num("ai_pages_per_month", "Fotos por mes")}
            {num("ai_max_pages_per_import", "Fotos por importación")}
            {num("max_branches", "Sucursales")}
            {num("max_members", "Personas")}
            {num("max_menus", "Cartas activas")}
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
            <span className="text-sm font-medium">Disponible para asignar</span>
            <Switch checked={values.is_active} disabled={plan.is_default} onCheckedChange={(c) => setValues((v) => ({ ...v, is_active: c }))} />
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="plan-form" pending={pending} pendingLabel="Guardando…">
            Guardar plan
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlansManager({ plans }: { plans: (PlanRow & { businesses: number })[] }) {
  const [editing, setEditing] = useState<PlanRow | null>(null);
  return (
    <>
      <div className="mb-4">
        <Button
          onClick={() =>
            setEditing({ id: null, code: "", name: "", description: "", max_branches: 1, max_members: 3, max_menus: 3, ai_pages_per_month: 20, ai_max_pages_per_import: 5, is_active: true })
          }
        >
          <Plus aria-hidden="true" /> Nuevo plan
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Fotos/mes</th>
              <th className="px-4 py-3 font-semibold">Por importación</th>
              <th className="px-4 py-3 font-semibold">Sucursales</th>
              <th className="px-4 py-3 font-semibold">Personas</th>
              <th className="px-4 py-3 font-semibold">Cartas</th>
              <th className="px-4 py-3 font-semibold">Negocios</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold">{p.name}</span>
                  <span className="block text-muted-foreground">
                    {p.code}
                    {p.is_default ? " · predeterminado" : ""}
                    {!p.is_active ? " · inactivo" : ""}
                  </span>
                </td>
                <td className="px-4 py-3">{p.ai_pages_per_month}</td>
                <td className="px-4 py-3">{p.ai_max_pages_per_import}</td>
                <td className="px-4 py-3">{p.max_branches}</td>
                <td className="px-4 py-3">{p.max_members}</td>
                <td className="px-4 py-3">{p.max_menus}</td>
                <td className="px-4 py-3">{p.businesses}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PlanDialog plan={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
