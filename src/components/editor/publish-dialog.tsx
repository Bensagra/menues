"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CircleCheck, QrCode, TriangleAlert } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/domain/text";
import { useAction } from "@/hooks/use-action";
import { publishMenuAction, publishPreviewAction, type PublishPreviewBranch } from "@/server/actions/catalog";

const FIELD_LABELS: Record<string, string> = {
  price: "Precio",
  status: "Disponibilidad",
  name: "Nombre",
  description: "Descripción",
  variants: "Variantes",
  extras: "Extras",
  tags: "Etiquetas",
  image: "Foto",
  category: "Categoría",
};

export function PublishDialog({
  menuId,
  menuName,
  base,
  appUrl,
  branchSlugs,
  accessibleBranchIds,
  source = "manual",
  importId = null,
  onClose,
}: {
  menuId: string;
  menuName: string;
  base: string;
  appUrl: string;
  branchSlugs: Record<string, string>;
  accessibleBranchIds: string[];
  source?: "manual" | "import" | "bulk_price";
  importId?: string | null;
  onClose: () => void;
}) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const preview = useAction(publishPreviewAction);
  const publish = useAction(publishMenuAction);
  const [branches, setBranches] = useState<PublishPreviewBranch[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<{ branches: { branch_id: string; changed: boolean; version_number: number }[] } | null>(null);
  const runPreview = preview.run;

  useEffect(() => {
    let cancelled = false;
    void runPreview(menuId).then((r) => {
      if (cancelled || !r.ok) return;
      const publishable = r.data.branches.filter((b) => accessibleBranchIds.includes(b.branchId));
      setBranches(publishable);
      setSelected(publishable.filter((b) => b.hasChanges).map((b) => b.branchId));
    });
    return () => {
      cancelled = true;
    };
  }, [menuId, runPreview, accessibleBranchIds]);

  const names = new Map((branches ?? []).map((b) => [b.branchId, b.name]));
  const selectedBranches = (branches ?? []).filter((b) => selected.includes(b.branchId));
  const emptyWarning = selectedBranches.some((b) => b.productCount === 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !publish.pending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="size-6 text-success" aria-hidden="true" /> Carta publicada
              </DialogTitle>
              <DialogDescription>Tus clientes ya ven la versión nueva. La anterior quedó en el historial.</DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2" role="status">
              {result.branches.map((b) => (
                <li key={b.branch_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <span>
                    <strong>{names.get(b.branch_id)}</strong>{" "}
                    <span className="text-sm text-muted-foreground">
                      {b.changed ? `· versión ${b.version_number}` : "· ya estaba al día, no se creó una versión nueva"}
                    </span>
                  </span>
                  {branchSlugs[b.branch_id] && (
                    <Button asChild variant="outline" size="sm">
                      <a href={`${appUrl}/m/${branchSlugs[b.branch_id]}`} target="_blank" rel="noopener">
                        <ArrowUpRight aria-hidden="true" /> Ver carta pública
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button asChild variant="outline">
                <Link href={`${base}/qr`}>
                  <QrCode aria-hidden="true" /> Descargar QR
                </Link>
              </Button>
              <Button onClick={onClose}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Publicar «{menuName}»</DialogTitle>
              <DialogDescription>
                Publicar reemplaza la carta pública de las sucursales elegidas en un solo paso. Hasta que termine, tus clientes siguen viendo
                la versión anterior.
              </DialogDescription>
            </DialogHeader>

            <ActionError error={preview.error} />
            {!branches && !preview.error && (
              <div className="grid gap-2" aria-busy="true">
                <span className="sr-only">Calculando cambios…</span>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {branches && branches.length === 0 && (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>No tenés sucursales donde publicar esta carta.</AlertDescription>
              </Alert>
            )}

            {branches && branches.length > 0 && (
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-semibold">Sucursales a publicar</legend>
                {branches.map((b) => (
                  <div key={b.branchId} className="rounded-lg border border-border">
                    <label className="flex min-h-14 items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={selected.includes(b.branchId)}
                        onCheckedChange={(checked) =>
                          setSelected((s) => (checked ? [...new Set([...s, b.branchId])] : s.filter((id) => id !== b.branchId)))
                        }
                      />
                      <span className="flex-1">
                        <span className="font-semibold">{b.name}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {!b.hasChanges
                            ? "Al día: no hay cambios para publicar."
                            : b.firstPublication
                              ? `Primera publicación · ${plural(b.productCount, "producto visible", "productos visibles")}`
                              : [
                                  b.priceChanges && `${b.priceChanges} con cambios de precio`,
                                  b.added && plural(b.added, "nuevo", "nuevos"),
                                  b.removed && `${b.removed} ${b.removed === 1 ? "deja" : "dejan"} de mostrarse`,
                                  b.changed - b.priceChanges > 0 && `${b.changed - b.priceChanges} con otros cambios`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Cambios menores"}
                        </span>
                      </span>
                      {b.hasChanges ? <Badge variant="warning">Con cambios</Badge> : <Badge variant="success">Al día</Badge>}
                    </label>
                    {b.hasChanges && !b.firstPublication && b.entries.length > 0 && (
                      <details className="border-t border-border px-3 py-2 text-sm">
                        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">Ver detalle de cambios</summary>
                        <ul className="mt-1 grid gap-1.5 pb-2">
                          {b.entries.map((entry) => (
                            <li key={entry.productId}>
                              <strong>{entry.name}</strong>{" "}
                              {entry.type === "added" && <span className="text-success">· nuevo</span>}
                              {entry.type === "removed" && <span className="text-warning">· deja de mostrarse</span>}
                              {entry.type === "changed" &&
                                entry.changes.map((c) => (
                                  <span key={c.field} className="block text-muted-foreground">
                                    {FIELD_LABELS[c.field] ?? c.field}: {c.before} → {c.after}
                                  </span>
                                ))}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </fieldset>
            )}

            {emptyWarning && (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>La carta no tiene productos visibles</AlertTitle>
                <AlertDescription>Si la publicás así, tus clientes verán una carta vacía.</AlertDescription>
              </Alert>
            )}
            <ActionError error={publish.error} />

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={publish.pending}>
                Cancelar
              </Button>
              <SubmitButton
                type="button"
                pending={publish.pending}
                pendingLabel="Publicando…"
                disabled={!branches || selected.length === 0}
                onClick={async () => {
                  const r = await publish.run(menuId, selected, idempotencyKey, { source, importId });
                  if (r.ok) setResult(r.data);
                }}
              >
                Publicar {selected.length > 1 ? `en ${selected.length} sucursales` : ""}
              </SubmitButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
