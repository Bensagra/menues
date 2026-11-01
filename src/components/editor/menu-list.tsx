"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, BookOpen, Copy, EllipsisVertical, MapPin, Plus } from "lucide-react";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { EmptyState } from "@/components/app/states";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { archiveMenuAction, createMenuAction, duplicateMenuAction } from "@/server/actions/catalog";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  productCount: number;
  branches: { id: string; name: string; published: boolean }[];
}

export function MenuList({
  base,
  businessId,
  menus,
  branches,
  canManage,
}: {
  base: string;
  businessId: string;
  menus: MenuItem[];
  branches: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<MenuItem | null>(null);
  const [archiving, setArchiving] = useState<MenuItem | null>(null);
  const visible = menus.filter((m) => m.status === tab);
  const archivedCount = menus.filter((m) => m.status === "archived").length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active">Activas</TabsTrigger>
            <TabsTrigger value="archived">Archivadas{archivedCount ? ` (${archivedCount})` : ""}</TabsTrigger>
          </TabsList>
        </Tabs>
        {canManage && (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nueva carta
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        tab === "active" ? (
          <EmptyState
            icon={BookOpen}
            title="Todavía no hay cartas"
            description="Creá una carta para empezar a cargar categorías y productos."
          >
            {canManage && (
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" /> Crear carta
              </Button>
            )}
          </EmptyState>
        ) : (
          <p className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-6 text-sm text-muted-foreground">No hay cartas archivadas.</p>
        )
      ) : (
        <ul className="grid gap-3">
          {visible.map((menu) => (
            <li key={menu.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <Link href={`${base}/menus/${menu.id}`} className="text-lg font-bold underline-offset-4 hover:underline">
                  {menu.name}
                </Link>
                {menu.description && <p className="mt-0.5 text-sm text-muted-foreground">{menu.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {menu.productCount} {menu.productCount === 1 ? "producto" : "productos"}
                  </span>
                  {menu.branches.length === 0 ? (
                    <Badge variant="warning">Sin sucursal asignada</Badge>
                  ) : (
                    menu.branches.map((b) => (
                      <Badge key={b.id} variant="outline">
                        <MapPin aria-hidden="true" />
                        {b.name}
                        {!b.published && <span className="font-normal text-muted-foreground">· sin publicar</span>}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {menu.status === "active" && (
                  <Button asChild variant="outline" className="hidden sm:inline-flex">
                    <Link href={`${base}/menus/${menu.id}`}>Editar</Link>
                  </Button>
                )}
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Más acciones para ${menu.name}`}>
                        <EllipsisVertical aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {menu.status === "active" ? (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href={`${base}/menus/${menu.id}`}>Editar</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDuplicating(menu)}>
                            <Copy aria-hidden="true" /> Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setArchiving(menu)}>
                            <Archive aria-hidden="true" /> Archivar
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onSelect={() => setArchiving(menu)}>
                          <ArchiveRestore aria-hidden="true" /> Restaurar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && <CreateMenuDialog base={base} businessId={businessId} branches={branches} onClose={() => setCreating(false)} />}
      {duplicating && <DuplicateMenuDialog base={base} menu={duplicating} onClose={() => setDuplicating(null)} />}
      {archiving && <ArchiveMenuDialog menu={archiving} onClose={() => setArchiving(null)} />}
    </div>
  );
}

function CreateMenuDialog({
  base,
  businessId,
  branches,
  onClose,
}: {
  base: string;
  businessId: string;
  branches: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>(branches.map((b) => b.id));
  const { run, pending, error, fieldErrors } = useAction(createMenuAction);
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva carta</DialogTitle>
          <DialogDescription>Por ejemplo: Carta principal, Bebidas o Menú del mediodía.</DialogDescription>
        </DialogHeader>
        <form
          id="create-menu"
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(businessId, { name, description, branchIds: selected });
            if (r.ok) router.push(`${base}/menus/${r.data.menuId}`);
          }}
        >
          <ActionError error={error && error.code !== "validation" ? error : null} />
          <FormField label="Nombre" error={fieldErrors.name}>
            {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
          </FormField>
          <FormField label="Descripción" optional error={fieldErrors.description}>
            {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />}
          </FormField>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Sucursales donde se muestra</legend>
            {branches.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={selected.includes(b.id)}
                  onCheckedChange={(checked) => setSelected((s) => (checked ? [...s, b.id] : s.filter((id) => id !== b.id)))}
                />
                {b.name}
              </label>
            ))}
            <p className="text-[13px] text-muted-foreground">No se publica nada hasta que lo indiques.</p>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <SubmitButton pending={pending} pendingLabel="Creando…" form="create-menu">
            Crear carta
          </SubmitButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateMenuDialog({ base, menu, onClose }: { base: string; menu: MenuItem; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${menu.name} (copia)`);
  const { run, pending, error, fieldErrors } = useAction(duplicateMenuAction);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Duplicar carta"
      description="Se copian categorías, productos, variantes, extras y precios por sucursal. La copia no se publica hasta que la publiques."
      confirmLabel="Duplicar"
      pending={pending}
      onConfirm={async () => {
        const r = await run(menu.id, name);
        if (r.ok) router.push(`${base}/menus/${r.data.menuId}`);
      }}
    >
      <ActionError error={error && error.code !== "validation" ? error : null} />
      <FormField label="Nombre de la copia" error={fieldErrors._ ?? fieldErrors.name}>
        {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
    </ConfirmDialog>
  );
}

function ArchiveMenuDialog({ menu, onClose }: { menu: MenuItem; onClose: () => void }) {
  const archiving = menu.status === "active";
  const { run, pending, error } = useAction(archiveMenuAction);
  const published = menu.branches.filter((b) => b.published).map((b) => b.name);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={archiving ? `¿Archivar «${menu.name}»?` : `¿Restaurar «${menu.name}»?`}
      description={
        archiving
          ? published.length
            ? `Deja de mostrarse en la carta pública de ${published.join(", ")} en este momento. Las versiones y el historial se conservan.`
            : "La carta deja de estar activa. Las versiones y el historial se conservan."
          : "La carta vuelve a estar activa. Si tenía una versión publicada, se vuelve a mostrar en sus sucursales."
      }
      confirmLabel={archiving ? "Archivar" : "Restaurar"}
      destructive={archiving}
      pending={pending}
      onConfirm={async () => {
        const r = await run(menu.id, archiving);
        if (r.ok) onClose();
      }}
    >
      <ActionError error={error} />
    </ConfirmDialog>
  );
}
