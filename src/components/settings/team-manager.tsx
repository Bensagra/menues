"use client";

import { useState } from "react";
import { Link2, Mail, MessageCircle, PencilLine, UserMinus, UserPlus } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { NativeSelect } from "@/components/app/native-select";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { canGrantRole, grantableRoles, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/domain/permissions";
import { formatDateTime } from "@/domain/time";
import { useAction } from "@/hooks/use-action";
import { createInvitationAction, revokeInvitationAction, revokeMembershipAction, updateMembershipAction } from "@/server/actions/settings";

export interface MemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  canPublish: boolean;
  allBranches: boolean;
  branchIds: string[];
  isSelf: boolean;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  canPublish: boolean;
  allBranches: boolean;
  branchIds: string[];
  expiresAt: string;
  expired: boolean;
}

interface Scope {
  role: Role;
  canPublish: boolean;
  allBranches: boolean;
  branchIds: string[];
}

function scopeText(scope: Scope, branches: { id: string; name: string }[]) {
  if (scope.role !== "editor") return "Todas las sucursales · puede publicar";
  const where = scope.allBranches ? "Todas las sucursales" : branches.filter((b) => scope.branchIds.includes(b.id)).map((b) => b.name).join(", ") || "Sin sucursales";
  return `${where} · ${scope.canPublish ? "puede publicar" : "no puede publicar"}`;
}

function ScopeFields({ value, onChange, actorRole, branches }: { value: Scope; onChange: (s: Scope) => void; actorRole: Role; branches: { id: string; name: string }[] }) {
  const roles = grantableRoles(actorRole);
  return (
    <>
      <FormField label="Rol" hint={ROLE_DESCRIPTIONS[value.role]}>
        {(props) => (
          <NativeSelect {...props} value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value as Role })}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      {value.role === "editor" && (
        <>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
            <span className="text-sm font-medium">Puede publicar</span>
            <Switch checked={value.canPublish} onCheckedChange={(c) => onChange({ ...value, canPublish: c })} />
          </label>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Sucursales</legend>
            <label className="flex min-h-11 items-center gap-3">
              <Checkbox checked={value.allBranches} onCheckedChange={(c) => onChange({ ...value, allBranches: Boolean(c) })} />
              Todas las sucursales (también las futuras)
            </label>
            {!value.allBranches &&
              branches.map((b) => (
                <label key={b.id} className="flex min-h-11 items-center gap-3 pl-8">
                  <Checkbox
                    checked={value.branchIds.includes(b.id)}
                    onCheckedChange={(c) => onChange({ ...value, branchIds: c ? [...value.branchIds, b.id] : value.branchIds.filter((id) => id !== b.id) })}
                  />
                  {b.name}
                </label>
              ))}
          </fieldset>
        </>
      )}
    </>
  );
}

export function TeamManager({
  businessId,
  businessName,
  actorRole,
  canManage,
  members,
  invitations,
  branches,
  timezone,
  seats,
}: {
  businessId: string;
  businessName: string;
  actorRole: Role;
  canManage: boolean;
  members: MemberRow[];
  invitations: InvitationRow[];
  branches: { id: string; name: string }[];
  timezone: string;
  seats: { used: number; limit: number };
}) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [revoking, setRevoking] = useState<MemberRow | null>(null);
  const [created, setCreated] = useState<{ link: string; email: string; expiresAt: string } | null>(null);
  const revokeInvite = useAction(revokeInvitationAction);
  const regenerate = useAction(createInvitationAction);

  return (
    <div className="grid gap-6">
      {created && (
        <Alert variant="success">
          <Link2 aria-hidden="true" />
          <AlertTitle>Invitación lista para {created.email}</AlertTitle>
          <AlertDescription>
            Compartí este enlace con esa persona: es personal, vence el {formatDateTime(created.expiresAt, timezone)} y sirve una sola vez. Por seguridad no se vuelve a mostrar.
            <code className="mt-2 block rounded-md bg-card px-3 py-2 text-sm break-all text-foreground">{created.link}</code>
          </AlertDescription>
          <AlertAction>
            <CopyButton value={created.link} />
            <Button asChild variant="outline">
              <a href={`https://wa.me/?text=${encodeURIComponent(`Te invito a sumarte a ${businessName} en CartaLista: ${created.link}`)}`} target="_blank" rel="noopener">
                <MessageCircle aria-hidden="true" /> WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`mailto:${created.email}?subject=${encodeURIComponent(`Invitación a ${businessName}`)}&body=${encodeURIComponent(`Te invito a sumarte a ${businessName} en CartaLista. Entrá con este enlace: ${created.link}`)}`}>
                <Mail aria-hidden="true" /> Email
              </a>
            </Button>
          </AlertAction>
        </Alert>
      )}

      <section aria-labelledby="miembros">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="miembros" className="text-base font-bold">
              Personas con acceso
            </h2>
            <p className="text-sm text-muted-foreground">
              {seats.used} de {seats.limit} lugares del plan (incluye invitaciones abiertas).
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setInviting(true)} disabled={seats.used >= seats.limit}>
              <UserPlus aria-hidden="true" /> Invitar
            </Button>
          )}
        </div>
        <ul className="grid gap-2">
          {members.map((m) => {
            const manageable = canManage && !m.isSelf && canGrantRole(actorRole, m.role);
            return (
              <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.name}
                    {m.isSelf && <span className="font-normal text-muted-foreground"> (vos)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{m.email}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>{ROLE_LABELS[m.role]}</Badge>
                    <span className="text-muted-foreground">{scopeText(m, branches)}</span>
                  </p>
                </div>
                {manageable && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
                      <PencilLine aria-hidden="true" /> Cambiar acceso
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(m)}>
                      <UserMinus aria-hidden="true" /> Quitar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[13px] text-muted-foreground">Nadie puede cambiar su propio acceso ni otorgar un rol superior al suyo.</p>
      </section>

      <section aria-labelledby="invitaciones">
        <h2 id="invitaciones" className="mb-3 text-base font-bold">
          Invitaciones abiertas
        </h2>
        {invitations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-4 text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="grid gap-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="font-semibold">{inv.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROLE_LABELS[inv.role]} · {inv.expired ? "vencida" : `vence el ${formatDateTime(inv.expiresAt, timezone)}`}
                  </p>
                </div>
                {canManage && canGrantRole(actorRole, inv.role) && (
                  <div className="flex gap-1">
                    <SubmitButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      pending={regenerate.pending}
                      onClick={async () => {
                        const r = await regenerate.run(businessId, {
                          email: inv.email,
                          role: inv.role,
                          canPublish: inv.canPublish,
                          allBranches: inv.allBranches,
                          branchIds: inv.branchIds,
                        });
                        if (r.ok) setCreated(r.data);
                      }}
                    >
                      Generar enlace nuevo
                    </SubmitButton>
                    <SubmitButton type="button" variant="ghost" size="sm" pending={revokeInvite.pending} onClick={() => void revokeInvite.run(inv.id)}>
                      Revocar
                    </SubmitButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ActionError error={revokeInvite.error ?? regenerate.error} className="mt-2" />
      </section>

      {inviting && (
        <InviteDialog
          businessId={businessId}
          actorRole={actorRole}
          branches={branches}
          onClose={() => setInviting(false)}
          onCreated={(c) => {
            setCreated(c);
            setInviting(false);
          }}
        />
      )}
      {editing && <EditMemberDialog member={editing} actorRole={actorRole} branches={branches} onClose={() => setEditing(null)} />}
      {revoking && <RevokeMemberDialog member={revoking} onClose={() => setRevoking(null)} />}
    </div>
  );
}

function InviteDialog({
  businessId,
  actorRole,
  branches,
  onClose,
  onCreated,
}: {
  businessId: string;
  actorRole: Role;
  branches: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (c: { link: string; email: string; expiresAt: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<Scope>({ role: "editor", canPublish: false, allBranches: branches.length <= 1, branchIds: [] });
  const { run, pending, error, fieldErrors } = useAction(createInvitationAction);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar a una persona</DialogTitle>
          <DialogDescription>Vas a obtener un enlace personal para compartir. La persona tiene que ingresar con este mismo email.</DialogDescription>
        </DialogHeader>
        <form
          id="invite-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(businessId, { email, ...scope });
            if (r.ok) onCreated(r.data);
          }}
        >
          <ActionError error={error && error.code !== "validation" ? error : null} />
          <FormField label="Email" error={fieldErrors.email}>
            {(props) => <Input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </FormField>
          <ScopeFields value={scope} onChange={setScope} actorRole={actorRole} branches={branches} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="invite-form" pending={pending} pendingLabel="Creando invitación…">
            Crear invitación
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, actorRole, branches, onClose }: { member: MemberRow; actorRole: Role; branches: { id: string; name: string }[]; onClose: () => void }) {
  const [scope, setScope] = useState<Scope>({ role: member.role, canPublish: member.canPublish, allBranches: member.allBranches, branchIds: member.branchIds });
  const { run, pending, error } = useAction(updateMembershipAction);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Acceso de {member.name}</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>
        <form
          id="member-form"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(member.membershipId, scope);
            if (r.ok) onClose();
          }}
        >
          <ActionError error={error} />
          <ScopeFields value={scope} onChange={setScope} actorRole={actorRole} branches={branches} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton form="member-form" pending={pending} pendingLabel="Guardando…">
            Guardar
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeMemberDialog({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const { run, pending, error } = useAction(revokeMembershipAction);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`¿Quitar el acceso de ${member.name}?`}
      description="Deja de poder entrar a este negocio en el acto. Su historial de cambios se conserva. Podés invitarla de nuevo más adelante."
      confirmLabel="Quitar acceso"
      destructive
      pending={pending}
      onConfirm={async () => {
        const r = await run(member.membershipId);
        if (r.ok) onClose();
      }}
    >
      <ActionError error={error} />
    </ConfirmDialog>
  );
}
