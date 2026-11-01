"use client";

import { useState } from "react";
import { CalendarClock, CircleAlert, CirclePause, CirclePlay, PencilLine, Plus, Trash2, TriangleAlert, UtensilsCrossed } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { MoneyInput } from "@/components/app/money-input";
import { EmptyState } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/domain/money";
import { WEEKDAY_ORDER, describeHours, describePeriod, describeWeekdays, shortTime, type PromotionState } from "@/domain/promotions";
import { useAction } from "@/hooks/use-action";
import { deletePromotionAction, savePromotionAction, setPromotionPausedAction } from "@/server/actions/promotions";

export interface PromotionRow {
  id: string;
  kind: "daily_menu" | "promotion";
  title: string;
  description: string;
  items: string[];
  price_minor: number | null;
  starts_on: string;
  ends_on: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  paused: boolean;
  revision: number;
  branch_ids: string[];
  overlaps: { id: string; title: string }[];
  /** Estado por sucursal, calculado en el servidor con la hora de cada una */
  states: { branchId: string; state: PromotionState }[];
  /** La persona puede editarla (su alcance cubre todas las sucursales) */
  editable: boolean;
}

export interface PromotionsEnv {
  businessId: string;
  currency: string;
  locale: string;
  today: string;
  defaultBranchId: string | null;
  branches: { id: string; name: string }[];
  canManage: boolean;
}

const KIND_LABEL = { daily_menu: "Menú del día", promotion: "Promoción" } as const;
const DAY_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const dayFmt = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const fromKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

function StateBadge({ state }: { state: PromotionState }) {
  switch (state.kind) {
    case "active":
      return (
        <Badge variant="success">
          <CirclePlay aria-hidden="true" /> Activa hasta las {shortTime(state.until)} h
        </Badge>
      );
    case "scheduled":
      return (
        <Badge variant="info">
          <CalendarClock aria-hidden="true" />
          Programada: {state.next.today ? "hoy" : dayFmt.format(fromKey(state.next.date))}, {shortTime(state.next.time)} h
        </Badge>
      );
    case "paused":
      return (
        <Badge variant="muted">
          <CirclePause aria-hidden="true" /> Pausada
        </Badge>
      );
    default:
      return <Badge variant="muted">Finalizada</Badge>;
  }
}

function addDays(key: string, days: number) {
  return new Date(fromKey(key).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

interface Draft {
  id: string | null;
  kind: "daily_menu" | "promotion";
  title: string;
  description: string;
  itemsText: string;
  priceMinor: number | null;
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  branchIds: string[];
  revision?: number;
}

function PromotionDialog({ env, draft: initial, onClose }: { env: PromotionsEnv; draft: Draft; onClose: (savedWithOverlaps?: { title: string }[]) => void }) {
  const [draft, setDraft] = useState(initial);
  const { run, pending, error, fieldErrors } = useAction(savePromotionAction);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const isDaily = draft.kind === "daily_menu";
  const toggleDay = (day: number) =>
    set("weekdays", draft.weekdays.includes(day) ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day]);

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Editar" : "Nuevo"} {isDaily ? "menú del día" : "promoción"}
          </DialogTitle>
          <DialogDescription>
            Se muestra en la carta pública solo en los días y horarios elegidos, con la hora local de cada sucursal. No hace falta publicar.
          </DialogDescription>
        </DialogHeader>
        <form
          id="promotion-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run({
              id: draft.id,
              businessId: env.businessId,
              kind: draft.kind,
              title: draft.title,
              description: draft.description,
              items: draft.itemsText.split("\n").map((i) => i.trim()).filter(Boolean),
              priceMinor: draft.priceMinor,
              startsOn: draft.startsOn,
              endsOn: draft.endsOn,
              weekdays: draft.weekdays,
              startTime: draft.startTime,
              endTime: draft.endTime,
              branchIds: draft.branchIds,
              expectedRevision: draft.revision,
            });
            if (r.ok) onClose(r.data.overlaps);
          }}
        >
          <ActionError error={error && error.code !== "validation" ? error : null} />
          <FormField label="Título" hint={isDaily ? "Por ejemplo: Menú ejecutivo." : "Por ejemplo: 2x1 en pintas."} error={fieldErrors.title}>
            {(props) => <Input {...props} value={draft.title} maxLength={80} onChange={(e) => set("title", e.target.value)} />}
          </FormField>
          <FormField
            label={isDaily ? "Qué incluye" : "Detalle"}
            optional={!isDaily}
            hint="Un ítem por línea. Por ejemplo: Entrada: sopa de calabaza."
            error={fieldErrors.items}
          >
            {(props) => <Textarea {...props} value={draft.itemsText} onChange={(e) => set("itemsText", e.target.value)} className="min-h-24" />}
          </FormField>
          <FormField label="Descripción" optional error={fieldErrors.description}>
            {(props) => <Input {...props} value={draft.description} maxLength={400} onChange={(e) => set("description", e.target.value)} />}
          </FormField>
          <FormField label="Precio" optional hint="Dejalo vacío si no tiene un precio único.">
            {(props) => <MoneyInput {...props} value={draft.priceMinor} currency={env.currency} locale={env.locale} onValueChange={(v) => set("priceMinor", v)} />}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Desde" error={fieldErrors.startsOn}>
              {(props) => <Input {...props} type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />}
            </FormField>
            <FormField label="Hasta (inclusive)" error={fieldErrors.endsOn}>
              {(props) => <Input {...props} type="date" value={draft.endsOn} min={draft.startsOn} onChange={(e) => set("endsOn", e.target.value)} />}
            </FormField>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Días</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_ORDER.map((day) => (
                <label
                  key={day}
                  className="relative flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-lg border border-input/60 bg-card px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary has-[[data-state=checked]]:text-primary-foreground"
                >
                  <Checkbox checked={draft.weekdays.includes(day)} onCheckedChange={() => toggleDay(day)} className="sr-only" />
                  {DAY_LABEL[day]}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Button type="button" variant="ghost" size="sm" onClick={() => set("weekdays", [1, 2, 3, 4, 5])}>
                Lunes a viernes
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("weekdays", [0, 1, 2, 3, 4, 5, 6])}>
                Todos los días
              </Button>
            </div>
            {fieldErrors.weekdays && <p className="text-[13px] font-medium text-error">{fieldErrors.weekdays}</p>}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Desde las" error={fieldErrors.startTime}>
              {(props) => <Input {...props} type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />}
            </FormField>
            <FormField label="Hasta las" error={fieldErrors.endTime}>
              {(props) => <Input {...props} type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />}
            </FormField>
          </div>
          {env.branches.length > 1 && (
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-semibold">Sucursales</legend>
              {env.branches.map((b) => (
                <label key={b.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <Checkbox
                    checked={draft.branchIds.includes(b.id)}
                    onCheckedChange={(c) => set("branchIds", c === true ? [...draft.branchIds, b.id] : draft.branchIds.filter((id) => id !== b.id))}
                  />
                  {b.name}
                </label>
              ))}
              {fieldErrors.branchIds && <p className="text-[13px] font-medium text-error">{fieldErrors.branchIds}</p>}
            </fieldset>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose()} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="promotion-form" pending={pending} pendingLabel="Guardando…">
            Guardar
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromotionCard({ row, env, onEdit, onDelete }: { row: PromotionRow; env: PromotionsEnv; onEdit: () => void; onDelete: () => void }) {
  const pause = useAction(setPromotionPausedAction);
  const names = new Map(env.branches.map((b) => [b.id, b.name]));
  const uniqueStates = new Set(row.states.map((s) => JSON.stringify(s.state)));
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{KIND_LABEL[row.kind]}</p>
          <h3 className="text-base font-bold">
            {row.title}
            {row.price_minor !== null && <span className="ml-2 font-semibold tabular-nums">{formatMoney(row.price_minor, env.currency, env.locale)}</span>}
          </h3>
          <p className="text-sm text-muted-foreground">
            {describePeriod(row.starts_on, row.ends_on)} · {describeWeekdays(row.weekdays)} · {describeHours(row.start_time, row.end_time)}
          </p>
          {env.branches.length > 1 && <p className="text-sm text-muted-foreground">En {row.branch_ids.map((id) => names.get(id) ?? "otra sucursal").join(", ")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {uniqueStates.size <= 1 ? (
            row.states[0] && <StateBadge state={row.states[0].state} />
          ) : (
            row.states.map((s) => (
              <span key={s.branchId} className="flex items-center gap-1 text-[13px]">
                {names.get(s.branchId)}: <StateBadge state={s.state} />
              </span>
            ))
          )}
        </div>
      </div>
      {row.items.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {row.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      {row.description && <p className="mt-2 text-sm">{row.description}</p>}
      {row.overlaps.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-surface p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Se superpone con {row.overlaps.map((o) => `«${o.title}»`).join(", ")}: en esos horarios se muestran las dos.
        </p>
      )}
      {env.canManage && row.editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilLine aria-hidden="true" /> Editar
          </Button>
          <SubmitButton type="button" size="sm" variant="outline" pending={pause.pending} onClick={() => void pause.run(row.id, !row.paused)}>
            {row.paused ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}
            {row.paused ? "Reanudar" : "Pausar"}
          </SubmitButton>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 aria-hidden="true" /> Eliminar
          </Button>
        </div>
      )}
      <ActionError error={pause.error} className="mt-3" />
    </li>
  );
}

export function PromotionsManager({ rows, env }: { rows: PromotionRow[]; env: PromotionsEnv }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<PromotionRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const remove = useAction(deletePromotionAction);

  const blank = (kind: Draft["kind"]): Draft => ({
    id: null,
    kind,
    title: kind === "daily_menu" ? "Menú del día" : "",
    description: "",
    itemsText: "",
    priceMinor: null,
    startsOn: env.today,
    endsOn: addDays(env.today, kind === "daily_menu" ? 4 : 6),
    weekdays: kind === "daily_menu" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
    startTime: kind === "daily_menu" ? "12:00" : "18:00",
    endTime: kind === "daily_menu" ? "16:00" : "21:00",
    branchIds: env.defaultBranchId ? [env.defaultBranchId] : env.branches.slice(0, 1).map((b) => b.id),
  });

  const groups: { key: string; title: string; rows: PromotionRow[] }[] = [
    { key: "active", title: "Activas ahora", rows: rows.filter((r) => r.states.some((s) => s.state.kind === "active")) },
    {
      key: "scheduled",
      title: "Programadas",
      rows: rows.filter((r) => !r.states.some((s) => s.state.kind === "active") && r.states.some((s) => s.state.kind === "scheduled")),
    },
    { key: "paused", title: "Pausadas", rows: rows.filter((r) => r.paused) },
    { key: "ended", title: "Finalizadas", rows: rows.filter((r) => !r.paused && r.states.every((s) => s.state.kind === "ended")) },
  ];

  return (
    <>
      {env.canManage && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button onClick={() => setDraft(blank("daily_menu"))}>
            <UtensilsCrossed aria-hidden="true" /> Nuevo menú del día
          </Button>
          <Button variant="outline" onClick={() => setDraft(blank("promotion"))}>
            <Plus aria-hidden="true" /> Nueva promoción
          </Button>
        </div>
      )}
      {!env.canManage && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CircleAlert className="size-4" aria-hidden="true" /> Podés ver la programación. Para crear o cambiar promociones hace falta permiso de publicación.
        </p>
      )}
      {notice && (
        <Alert variant="warning" className="mb-4">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Todavía no programaste menús del día ni promociones"
          description="Programalos una vez con fechas, días y horario: aparecen solos en la carta pública cuando corresponde y desaparecen al terminar."
        />
      ) : (
        <div className="grid gap-6">
          {groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key} aria-labelledby={`grupo-${g.key}`}>
                <h2 id={`grupo-${g.key}`} className="mb-3 text-base font-bold">
                  {g.title} <span className="font-medium text-muted-foreground tabular-nums">({g.rows.length})</span>
                </h2>
                <ul className="grid gap-3">
                  {g.rows.map((row) => (
                    <PromotionCard
                      key={row.id}
                      row={row}
                      env={env}
                      onDelete={() => setDeleting(row)}
                      onEdit={() =>
                        setDraft({
                          id: row.id,
                          kind: row.kind,
                          title: row.title,
                          description: row.description,
                          itemsText: row.items.join("\n"),
                          priceMinor: row.price_minor,
                          startsOn: row.starts_on,
                          endsOn: row.ends_on,
                          weekdays: row.weekdays,
                          startTime: row.start_time,
                          endTime: row.end_time,
                          branchIds: row.branch_ids,
                          revision: row.revision,
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
      {draft && (
        <PromotionDialog
          env={env}
          draft={draft}
          onClose={(overlaps) => {
            setDraft(null);
            setNotice(
              overlaps && overlaps.length > 0
                ? `Guardada. Se superpone con ${overlaps.map((o) => `«${o.title}»`).join(", ")}: en esos horarios se muestran las dos.`
                : null,
            );
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`¿Eliminar «${deleting.title}»?`}
          description="Deja de mostrarse en la carta pública en este momento. Si solo querés frenarla un tiempo, pausala."
          confirmLabel="Eliminar"
          destructive
          pending={remove.pending}
          onConfirm={async () => {
            const r = await remove.run(deleting.id);
            if (r.ok) setDeleting(null);
          }}
        >
          <ActionError error={remove.error} />
        </ConfirmDialog>
      )}
    </>
  );
}
