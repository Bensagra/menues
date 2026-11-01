"use client";

import { cn } from "cn";
import { Check, CircleAlert, Image as ImageIcon, PencilLine, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import type { ReviewProposal } from "@/server/queries/imports";
import { FLAG_LABELS, KIND_META } from "./labels";

interface Variant {
  variant_id?: string | null;
  name: string | null;
  price_minor?: number | null;
  price_text?: string | null;
}

function ValueBlock({
  title,
  children,
  muted,
}: {
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-border p-3", muted ? "bg-background" : "bg-card")}>
      <p className="mb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="grid gap-0.5 text-sm">{children}</div>
    </div>
  );
}

export function ProposalCard({
  proposal,
  currency,
  locale,
  busy,
  readOnly,
  pricesOnly,
  selected,
  onSelect,
  onApprove,
  onReject,
  onReset,
  onCorrect,
  onShowPage,
}: {
  proposal: ReviewProposal;
  currency: string;
  locale: string;
  busy: boolean;
  readOnly: boolean;
  pricesOnly: boolean;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onCorrect: (mode: "correct" | "same" | "new") => void;
  onShowPage: (page: number) => void;
}) {
  const meta = KIND_META[proposal.kind] ?? KIND_META.no_change;
  const Icon = meta.icon;
  const current = (proposal.current_value ?? null) as { name?: string; description?: string; price_minor?: number | null; category?: string | null; variants?: Variant[] } | null;
  const detected = proposal.detected_value as {
    name?: string | null;
    description?: string | null;
    category?: string | null;
    price_text?: string | null;
    variants?: Variant[];
    illegible_fields?: string[];
    pages?: number[];
    candidates?: { product_id: string; name: string; category: string | null }[];
  };
  const proposed = (proposal.proposed_value ?? null) as { name?: string; description?: string; price_minor?: number | null; variants?: Variant[] } | null;
  const fmt = (minor: number | null | undefined) => (minor === null || minor === undefined ? "Sin precio" : formatMoney(minor, currency, locale));
  const decided = proposal.status === "approved" || proposal.status === "rejected";
  const informational = !proposal.applicable || proposal.status === "skipped";
  const isMatch = proposal.kind === "uncertain_match" || proposal.kind === "possible_duplicate";
  const needsCorrection =
    (proposal.kind === "illegible" || (proposal.kind === "variant_change" && !proposal.proposed_value) || (proposal.kind === "price_change" && !proposal.proposed_value));
  const title = current?.name ?? proposed?.name ?? detected.name ?? "Producto sin nombre legible";
  const showPrices = ["price_change", "variant_change", "illegible", "uncertain_match", "possible_duplicate", "new_product", "no_change", "not_found"].includes(proposal.kind);

  return (
    <article
      aria-labelledby={`p-${proposal.id}`}
      onFocus={onSelect}
      onClick={onSelect}
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        selected ? "border-primary ring-2 ring-primary/15" : "border-border",
        proposal.status === "rejected" && "opacity-70",
        proposal.status === "conflict" && "border-warning",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
          {meta.label}
        </span>
        <span className="flex items-center gap-1.5">
          {proposal.status === "approved" && (
            <Badge variant="success">
              <Check aria-hidden="true" /> {proposal.corrected ? "Aprobado con corrección" : "Aprobado"}
            </Badge>
          )}
          {proposal.status === "rejected" && <Badge variant="muted">Descartado</Badge>}
          {proposal.status === "applied" && <Badge variant="success">Aplicado</Badge>}
          {proposal.status === "conflict" && (
            <Badge variant="warning">
              <CircleAlert aria-hidden="true" /> Conflicto
            </Badge>
          )}
          {proposal.status === "pending" && proposal.needs_review && proposal.applicable && (
            <Badge variant="warning">
              <CircleAlert aria-hidden="true" /> Por revisar
            </Badge>
          )}
          {proposal.page_number && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={(e) => {
                e.stopPropagation();
                onShowPage(proposal.page_number!);
              }}
              aria-label={`Ver la página ${proposal.page_number} en la foto`}
            >
              <ImageIcon aria-hidden="true" /> Pág. {proposal.page_number}
            </Button>
          )}
        </span>
      </div>

      <h3 id={`p-${proposal.id}`} className="mt-1 text-base font-bold">
        {proposal.kind === "new_category" ? `Sección «${proposed?.name ?? detected.name}»` : title}
      </h3>

      {proposal.kind !== "new_category" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ValueBlock title={proposal.status === "conflict" ? "Versión actual (cambió)" : "En tu carta"} muted>
            {current ? (
              <>
                {proposal.kind === "description_change" ? (
                  <p>{current.description || "Sin descripción"}</p>
                ) : (
                  <>
                    {current.variants?.length ? (
                      current.variants.map((v) => (
                        <p key={v.variant_id ?? v.name} className="price">
                          {v.name}: {fmt(v.price_minor)}
                        </p>
                      ))
                    ) : (
                      showPrices && <p className="price">{fmt(current.price_minor)}</p>
                    )}
                    {current.category && <p className="text-muted-foreground">En «{current.category}»</p>}
                  </>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No está en tu carta</p>
            )}
          </ValueBlock>
          <ValueBlock title="En la foto">
            {proposal.kind === "description_change" ? (
              <p>{detected.description}</p>
            ) : (
              <>
                {detected.name && detected.name !== current?.name && <p className="font-medium">«{detected.name}»</p>}
                {detected.variants?.length ? (
                  detected.variants.map((v, i) => (
                    <p key={`${v.name}-${i}`} className="price">
                      {v.name}: {v.price_text ?? "ilegible"}
                    </p>
                  ))
                ) : detected.illegible_fields?.includes("price") ? (
                  <p className="font-medium text-warning">Precio ilegible{detected.price_text ? ` («${detected.price_text}»)` : ""}</p>
                ) : (
                  <p className="price">{detected.price_text ?? "Sin precio impreso"}</p>
                )}
                {detected.category && proposal.kind === "new_product" && <p className="text-muted-foreground">Sección «{detected.category}»</p>}
              </>
            )}
          </ValueBlock>
        </div>
      )}

      {proposed && (proposal.status === "approved" || !proposal.needs_review) && proposal.kind !== "description_change" && proposal.kind !== "new_category" && (
        <p className="price mt-2 text-sm whitespace-normal">
          <span className="text-muted-foreground">Se aplicará: </span>
          {proposed.variants?.length
            ? proposed.variants.map((v) => `${v.name} ${fmt(v.price_minor)}`).join(" · ")
            : proposed.price_minor !== undefined
              ? fmt(proposed.price_minor)
              : proposed.name ?? ""}
        </p>
      )}

      {proposal.reason && <p className="mt-2 text-sm text-muted-foreground">{proposal.reason}</p>}
      {detected.candidates && detected.candidates.length > 1 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Parecidos en tu carta: {detected.candidates.map((c) => `«${c.name}»${c.category ? ` (${c.category})` : ""}`).join(", ")}
        </p>
      )}
      {proposal.flags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Señales a revisar">
          {proposal.flags.map((flag) => (
            <li key={flag}>
              <Badge variant={flag.includes("branch") || flag.includes("repeated") ? "info" : "warning"}>{FLAG_LABELS[flag] ?? flag}</Badge>
            </li>
          ))}
        </ul>
      )}

      {!informational && !readOnly && proposal.status !== "applied" && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {decided ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReset}>
              <RotateCcw aria-hidden="true" /> Deshacer
            </Button>
          ) : isMatch ? (
            <>
              <Button type="button" size="sm" disabled={busy} onClick={() => onCorrect("same")}>
                <Check aria-hidden="true" /> Es el mismo producto
              </Button>
              {!pricesOnly && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCorrect("new")}>
                  Es otro: agregarlo
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReject}>
                <X aria-hidden="true" /> Descartar
              </Button>
            </>
          ) : (
            <>
              {!needsCorrection && (
                <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
                  <Check aria-hidden="true" /> {proposal.status === "conflict" ? "Aplicar igual" : "Aprobar"}
                </Button>
              )}
              <Button type="button" variant={needsCorrection ? "default" : "outline"} size="sm" disabled={busy} onClick={() => onCorrect("correct")}>
                <PencilLine aria-hidden="true" /> {needsCorrection ? "Completar dato" : "Corregir"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onReject}>
                <X aria-hidden="true" /> Descartar
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
