"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { CheckCheck, CircleCheck, Send, TriangleAlert, X } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SimulatedBadge } from "@/components/app/status";
import { PublishDialog } from "@/components/editor/publish-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeSummary } from "@/domain/diff";
import { useAction } from "@/hooks/use-action";
import { applyImportAction, bulkDecideAction, decideProposalAction } from "@/server/actions/imports";
import type { ImportDetail, ReviewProposal } from "@/server/queries/imports";
import { CorrectDialog } from "./correct-dialog";
import { ImageViewer } from "./image-viewer";
import { FILTERS, type ReviewFilter } from "./labels";
import { ProposalCard } from "./proposal-card";

const PRICE_KINDS = ["price_change", "variant_change"];
const NEW_KINDS = ["new_product", "new_category"];

function matchesFilter(p: ReviewProposal, filter: ReviewFilter) {
  if (filter === "prices") return PRICE_KINDS.includes(p.kind) || (p.kind === "illegible" && Boolean(p.product_id));
  if (filter === "new") return NEW_KINDS.includes(p.kind);
  if (filter === "review") return (p.needs_review && p.status === "pending" && p.applicable) || p.status === "conflict";
  return true;
}

export function ImportReview({
  detail,
  env,
}: {
  detail: ImportDetail;
  env: {
    base: string;
    currency: string;
    locale: string;
    canPublish: boolean;
    readOnly: boolean;
    appUrl: string;
    branchSlugs: Record<string, string>;
    accessibleBranchIds: string[];
  };
}) {
  const imp = detail.import;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [page, setPage] = useState(detail.images[0]?.page_number ?? 1);
  const [mobileView, setMobileView] = useState<"cambios" | "imagen">("cambios");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ proposal: ReviewProposal; mode: "correct" | "same" | "new" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const decide = useAction(decideProposalAction);
  const bulk = useAction(bulkDecideAction);
  const apply = useAction(applyImportAction);
  const completed = imp.status === "completed";
  const readOnly = env.readOnly || completed || imp.status !== "needs_review";
  const pricesOnly = imp.scope === "prices_only";

  const actionable = detail.proposals.filter((p) => p.applicable && p.status !== "skipped");
  const informational = detail.proposals.filter((p) => !p.applicable || p.status === "skipped");
  const pendingCount = actionable.filter((p) => p.status === "pending" || p.status === "conflict").length;
  const approvedCount = actionable.filter((p) => p.status === "approved").length;
  const validPending = actionable.filter(
    (p) => p.status === "pending" && !p.needs_review && p.proposed_value && !["illegible", "uncertain_match", "possible_duplicate"].includes(p.kind),
  ).length;
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, actionable.filter((p) => matchesFilter(p, f.value)).length])) as Record<
    ReviewFilter,
    number
  >;
  const summary = describeSummary({
    price_changes: actionable.filter((p) => PRICE_KINDS.includes(p.kind) && !p.needs_review).length,
    new_products: actionable.filter((p) => p.kind === "new_product" && !p.needs_review).length,
    details_changes: actionable.filter((p) => ["description_change", "name_change"].includes(p.kind) && !p.needs_review).length,
    needs_review: actionable.filter((p) => p.needs_review).length,
  });
  const visible = actionable.filter((p) => matchesFilter(p, filter));
  const newCategoryRefs = detail.proposals
    .filter((p) => p.kind === "new_category" && p.new_category_ref && p.status !== "rejected")
    .map((p) => ({ ref: p.new_category_ref!, name: String((p.proposed_value as { name?: string } | null)?.name ?? "") }));

  async function runDecision(p: ReviewProposal, decision: "approve" | "reject" | "reset") {
    setBusyId(p.id);
    await decide.run(p.id, decision);
    setBusyId(null);
  }

  const showPage = (n: number) => {
    setPage(n);
    setMobileView("imagen");
  };

  if (completed) {
    const applied = detail.proposals.filter((p) => p.status === "applied").length;
    return (
      <div className="grid gap-5">
        <Alert variant="success">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Aplicaste {applied} {applied === 1 ? "cambio" : "cambios"} al borrador</AlertTitle>
          <AlertDescription>
            Tus clientes todavía ven la versión publicada. {env.canPublish ? "Publicá para que vean los cambios." : "Pedile a alguien con permiso que publique."}
          </AlertDescription>
          <AlertAction>
            {env.canPublish && !env.readOnly && (
              <Button onClick={() => setPublishing(true)}>
                <Send aria-hidden="true" /> Publicar ahora
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`${env.base}/menus/${imp.menu_id}`}>Ver el borrador</Link>
            </Button>
          </AlertAction>
        </Alert>
        <ProposalsReadOnly detail={detail} env={env} />
        {publishing && (
          <PublishDialog
            menuId={imp.menu_id}
            menuName={detail.menuName}
            base={env.base}
            appUrl={env.appUrl}
            branchSlugs={env.branchSlugs}
            accessibleBranchIds={env.accessibleBranchIds.filter((id) => detail.branchIds.includes(id))}
            source="import"
            importId={imp.id}
            onClose={() => setPublishing(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-bold" role="status">
          {summary}
        </p>
        {imp.provider === "mock" && <SimulatedBadge />}
      </div>

      {conflictCount > 0 && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Alguien modificó la carta mientras revisabas</AlertTitle>
          <AlertDescription>
            {conflictCount === 1 ? "Un producto cambió" : `${conflictCount} productos cambiaron`} después del análisis. Revisá la versión actual y decidí si aplicar igual o descartar.
            No se aplicó nada todavía.
          </AlertDescription>
        </Alert>
      )}

      {/* Barra de acciones y filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
          <TabsList className="h-auto flex-wrap">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label} ({counts[f.value]})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <SubmitButton type="button" variant="outline" pending={bulk.pending} disabled={validPending === 0} onClick={() => void bulk.run(imp.id, "approve")}>
              <CheckCheck aria-hidden="true" /> Aprobar los válidos ({validPending})
            </SubmitButton>
            <Button type="button" variant="ghost" disabled={pendingCount === 0 || bulk.pending} onClick={() => setConfirmReject(true)}>
              <X aria-hidden="true" /> Descartar pendientes
            </Button>
          </div>
        )}
      </div>
      <ActionError error={decide.error ?? bulk.error ?? apply.error} />

      {/* Mobile: alternar Imagen / Cambios */}
      <div className="lg:hidden">
        <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as "cambios" | "imagen")}>
          <TabsList className="w-full">
            <TabsTrigger value="cambios">Cambios ({actionable.length})</TabsTrigger>
            <TabsTrigger value="imagen">Imagen</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn("lg:sticky lg:top-6 lg:block lg:h-[calc(100dvh-3rem)]", mobileView === "imagen" ? "block h-[70dvh]" : "hidden")}>
          <ImageViewer images={detail.images} page={page} onPageChange={setPage} />
        </div>
        <div className={cn("grid content-start gap-3 lg:grid", mobileView === "cambios" ? "grid" : "hidden")}>
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-6 text-sm text-muted-foreground">
              {actionable.length === 0 ? "No encontramos cambios para aplicar en estas fotos." : "No hay cambios en este filtro."}
            </p>
          ) : (
            visible.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                currency={env.currency}
                locale={env.locale}
                busy={busyId === p.id || bulk.pending || apply.pending}
                readOnly={readOnly}
                pricesOnly={pricesOnly}
                selected={selectedId === p.id}
                onSelect={() => {
                  setSelectedId(p.id);
                  if (p.page_number) setPage(p.page_number);
                }}
                onApprove={() => void runDecision(p, "approve")}
                onReject={() => void runDecision(p, "reject")}
                onReset={() => void runDecision(p, "reset")}
                onCorrect={(mode) => setCorrecting({ proposal: p, mode })}
                onShowPage={showPage}
              />
            ))
          )}
          {informational.length > 0 && filter === "all" && (
            <details className="rounded-xl border border-border bg-card p-4 text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                {informational.length} {informational.length === 1 ? "producto sin cambios o fuera del alcance" : "productos sin cambios o fuera del alcance"}
              </summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {informational.map((p) => (
                  <li key={p.id}>
                    {String((p.current_value as { name?: string } | null)?.name ?? (p.detected_value as { name?: string }).name ?? "Sin nombre")} · {p.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* Aplicar */}
      {!readOnly && (
        <div className="sticky bottom-16 z-20 flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-md sm:flex-row sm:items-center sm:justify-between lg:bottom-4">
          <p className="text-sm" role="status">
            {pendingCount > 0 ? (
              <>
                <strong>{pendingCount}</strong> {pendingCount === 1 ? "cambio sin decidir" : "cambios sin decidir"} · {approvedCount} aprobados
              </>
            ) : (
              <>
                <strong>{approvedCount}</strong> {approvedCount === 1 ? "cambio aprobado" : "cambios aprobados"} listos para aplicar al borrador
              </>
            )}
          </p>
          <SubmitButton
            type="button"
            size="lg"
            pending={apply.pending}
            pendingLabel="Aplicando…"
            disabled={pendingCount > 0}
            onClick={async () => {
              const r = await apply.run(imp.id);
              if (r.ok && r.data.status === "conflicts") setConflictCount(r.data.conflicts?.length ?? 0);
            }}
          >
            Aplicar {approvedCount > 0 ? `${approvedCount} ` : ""}al borrador
          </SubmitButton>
        </div>
      )}

      {correcting && (
        <CorrectDialog
          proposal={correcting.proposal}
          mode={correcting.mode}
          scope={imp.scope}
          currency={env.currency}
          locale={env.locale}
          categories={detail.categories}
          newCategoryRefs={newCategoryRefs}
          onClose={() => setCorrecting(null)}
        />
      )}
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="¿Descartar los cambios pendientes?"
        description="Los cambios que todavía no aprobaste se descartan. Los aprobados se mantienen."
        confirmLabel="Descartar pendientes"
        destructive
        pending={bulk.pending}
        onConfirm={async () => {
          const r = await bulk.run(imp.id, "reject");
          if (r.ok) setConfirmReject(false);
        }}
      />
    </div>
  );
}

function ProposalsReadOnly({ detail, env }: { detail: ImportDetail; env: { currency: string; locale: string } }) {
  const applied = detail.proposals.filter((p) => p.status === "applied");
  if (!applied.length) return null;
  return (
    <section aria-labelledby="aplicados" className="grid gap-3">
      <h2 id="aplicados" className="text-base font-bold">
        Cambios aplicados
      </h2>
      {applied.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          currency={env.currency}
          locale={env.locale}
          busy={false}
          readOnly
          pricesOnly={false}
          selected={false}
          onSelect={() => undefined}
          onApprove={() => undefined}
          onReject={() => undefined}
          onReset={() => undefined}
          onCorrect={() => undefined}
          onShowPage={() => undefined}
        />
      ))}
    </section>
  );
}
