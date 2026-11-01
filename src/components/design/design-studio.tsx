"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { Check, Circle, ExternalLink, Loader2, Paintbrush, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ActionError, FormField, SubmitButton } from "@/components/app/form";
import { NativeSelect } from "@/components/app/native-select";
import { SimulatedBadge } from "@/components/app/status";
import { PublicMenu } from "@/components/menu/public-menu";
import type { PublicMenuData } from "@/components/menu/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DESIGN_SOURCE_LABELS, type DesignSource } from "@/domain/design-proposal";
import {
  BODY_FONTS,
  CATEGORY_STYLES,
  COLOR_LABELS,
  CORNER_STYLES,
  DISPLAY_FONTS,
  DIVIDER_STYLES,
  HEADER_STYLES,
  THEME_COLOR_KEYS,
  effectiveTheme,
  fixTheme,
  themeIssues,
  type MenuTheme,
  type ThemeColorKey,
} from "@/domain/theme";
import { isSocialProfile } from "@/domain/website";
import { useAction } from "@/hooks/use-action";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { applyDesignAction, designStatusAction, requestDesignAction, saveThemeAction } from "@/server/actions/design";

export interface DesignRequestView {
  id: string;
  status: "pending" | "processing" | "ready" | "failed" | "applied";
  theme: MenuTheme | null;
  summary: string;
  sources: DesignSource[];
  simulated: boolean;
  errorMessage: string | null;
  origin: "manual" | "import";
}

interface Props {
  businessId: string;
  readOnly: boolean;
  savedTheme: MenuTheme | null;
  brandColor: string | null;
  websiteUrl: string;
  references: { logo: boolean; cover: boolean; menuPhoto: boolean };
  links: { settings: string; importPhoto: string; publicMenu: string | null };
  request: DesignRequestView | null;
  aiAvailable: boolean;
  preview: PublicMenuData;
  previewIsSample: boolean;
  serverNow: number;
}

const sameTheme = (a: MenuTheme, b: MenuTheme) => JSON.stringify(a) === JSON.stringify(b);

export function DesignStudio(props: Props) {
  const { businessId, readOnly, savedTheme, request } = props;
  const current = effectiveTheme(savedTheme, props.brandColor);
  const proposal = request?.status === "ready" && request.theme ? { ...request, theme: request.theme } : null;
  const [draft, setDraft] = useState<MenuTheme>(current);
  const [showing, setShowing] = useState<"proposal" | "draft">(proposal ? "proposal" : "draft");
  const save = useAction(saveThemeAction);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = !sameTheme(draft, current);
  useUnsavedChanges(dirty && !readOnly);

  const edit = (next: MenuTheme) => {
    setDraft(next);
    setShowing("draft");
    setSaved(false);
  };
  const previewTheme = showing === "proposal" && proposal ? proposal.theme : draft;
  const issues = themeIssues(draft);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <ProposalPanel
        {...props}
        proposal={proposal}
        onAdjust={(theme) => {
          edit(theme);
          document.getElementById("ajustes")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onShow={() => setShowing("proposal")}
        showingProposal={showing === "proposal"}
      />

      <aside className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" aria-labelledby="vista-previa">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="vista-previa" className="text-base font-bold">
            Vista previa
          </h2>
          {proposal && (
            <div className="flex rounded-lg border border-border bg-card p-0.5 text-[13px] font-semibold" role="group" aria-label="Qué diseño mostrar">
              {(["proposal", "draft"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={showing === key}
                  onClick={() => setShowing(key)}
                  className={cn("min-h-9 rounded-md px-3", showing === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {key === "proposal" ? "Propuesta" : dirty ? "Tus ajustes" : "Diseño actual"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[28px] border-[6px] border-[#202a24] bg-[#202a24] shadow-lg">
          <div className="h-[640px] overflow-y-auto overscroll-contain rounded-[22px]" tabIndex={0} aria-label="Vista previa de la carta">
            <PublicMenu data={{ ...props.preview, business: { ...props.preview.business, theme: previewTheme } }} serverNow={props.serverNow} />
          </div>
        </div>
        <p className="mt-2 text-center text-[13px] text-muted-foreground">
          {props.previewIsSample ? "Con productos de ejemplo: tu carta todavía no tiene productos." : "Con los productos de tu borrador."}
        </p>
        {props.links.publicMenu && (
          <p className="mt-1 text-center text-[13px]">
            <a href={props.links.publicMenu} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline">
              Ver mi carta publicada <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </p>
        )}
      </aside>

      <section id="ajustes" aria-labelledby="ajustes-titulo" className="min-w-0 scroll-mt-6 rounded-xl border border-border bg-card p-5 sm:p-6 lg:col-start-1">
        <div className="flex items-start gap-3">
          <Paintbrush className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id="ajustes-titulo" className="text-lg font-bold">
              Ajustar a mano
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Cambiá lo que quieras y mirá el resultado en la vista previa. Nada cambia en tu carta hasta que guardes.</p>
          </div>
        </div>

        <form
          className="mt-5 grid gap-6"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await save.run(businessId, draft);
            if (r.ok) setSaved(true);
          }}
        >
          <fieldset disabled={readOnly || save.pending} className="grid gap-6">
            <ActionError error={save.error} />
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-bold">Colores</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {THEME_COLOR_KEYS.map((key) => (
                  <ColorField key={key} colorKey={key} value={draft.colors[key]} onChange={(value) => edit({ ...draft, colors: { ...draft.colors, [key]: value } })} />
                ))}
              </div>
              {issues.length > 0 && (
                <Alert variant="warning" className="mt-4">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    <ul className="grid gap-0.5">
                      {issues.map((issue) => (
                        <li key={`${issue.color}-${issue.on}`}>{issue.message}</li>
                      ))}
                    </ul>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => edit(fixTheme(draft))}>
                      <Wand2 aria-hidden="true" /> Corregir contraste
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Letra de títulos" hint={DISPLAY_FONTS[draft.fonts.display].hint}>
                {(p) => (
                  <NativeSelect {...p} value={draft.fonts.display} onChange={(e) => edit({ ...draft, fonts: { ...draft.fonts, display: e.target.value as MenuTheme["fonts"]["display"] } })}>
                    {Object.entries(DISPLAY_FONTS).map(([id, font]) => (
                      <option key={id} value={id}>
                        {font.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField label="Letra de textos" hint={BODY_FONTS[draft.fonts.body].hint}>
                {(p) => (
                  <NativeSelect {...p} value={draft.fonts.body} onChange={(e) => edit({ ...draft, fonts: { ...draft.fonts, body: e.target.value as MenuTheme["fonts"]["body"] } })}>
                    {Object.entries(BODY_FONTS).map(([id, font]) => (
                      <option key={id} value={id}>
                        {font.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <StyleSelect label="Encabezado" options={HEADER_STYLES} value={draft.style.header} onChange={(v) => edit({ ...draft, style: { ...draft.style, header: v } })} />
              <StyleSelect label="Títulos de categorías" options={CATEGORY_STYLES} value={draft.style.categories} onChange={(v) => edit({ ...draft, style: { ...draft.style, categories: v } })} />
              <StyleSelect label="Separadores" options={DIVIDER_STYLES} value={draft.style.dividers} onChange={(v) => edit({ ...draft, style: { ...draft.style, dividers: v } })} />
              <StyleSelect label="Esquinas" options={CORNER_STYLES} value={draft.style.corners} onChange={(v) => edit({ ...draft, style: { ...draft.style, corners: v } })} />
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pending={save.pending} pendingLabel="Guardando…" disabled={readOnly || !dirty || issues.length > 0}>
              Guardar diseño
            </SubmitButton>
            {dirty && (
              <Button type="button" variant="outline" onClick={() => edit(current)} disabled={save.pending}>
                Descartar cambios
              </Button>
            )}
            {savedTheme && !dirty && (
              <Button type="button" variant="ghost" onClick={() => setConfirmReset(true)} disabled={readOnly || save.pending}>
                Volver al diseño estándar
              </Button>
            )}
            {saved && !dirty && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-success" role="status">
                <Check className="size-4" aria-hidden="true" /> Guardado. Tu carta ya se ve así.
              </span>
            )}
          </div>
        </form>
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="¿Volver al diseño estándar?"
          description="Tu carta pública va a mostrar el diseño de CartaLista con tu color de marca. Podés pedir otra propuesta cuando quieras."
          confirmLabel="Volver al estándar"
          pending={save.pending}
          onConfirm={async () => {
            const r = await save.run(businessId, null);
            if (r.ok) {
              setConfirmReset(false);
              setDraft(effectiveTheme(null, props.brandColor));
            }
          }}
        />
      </section>
    </div>
  );
}

function ProposalPanel({
  businessId,
  readOnly,
  websiteUrl,
  references,
  links,
  request,
  aiAvailable,
  proposal,
  showingProposal,
  onAdjust,
  onShow,
}: Props & {
  proposal: (DesignRequestView & { theme: MenuTheme }) | null;
  showingProposal: boolean;
  onAdjust: (theme: MenuTheme) => void;
  onShow: () => void;
}) {
  const router = useRouter();
  const [website, setWebsite] = useState(websiteUrl);
  const ask = useAction(requestDesignAction);
  const apply = useAction(applyDesignAction);
  const inFlight = request?.status === "pending" || request?.status === "processing";
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    if (!request || !inFlight) return;
    let active = true;
    const timer = setInterval(async () => {
      const result = await designStatusAction(request.id);
      if (!active || !result.ok) return;
      setRetrying(result.data.attempts > 1 && result.data.status === "pending" ? result.data.error_message : null);
      if (!["pending", "processing"].includes(result.data.status)) {
        clearInterval(timer);
        router.refresh();
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request, inFlight, router]);

  const refs: { key: string; label: string; ok: boolean; missing: React.ReactNode }[] = [
    {
      key: "logo",
      label: "Logo",
      ok: references.logo,
      missing: (
        <a href={links.settings} className="font-semibold text-primary underline underline-offset-4">
          Subilo en Configuración
        </a>
      ),
    },
    {
      key: "cover",
      label: "Foto del local (portada)",
      ok: references.cover,
      missing: (
        <a href={links.settings} className="font-semibold text-primary underline underline-offset-4">
          Subí una foto de tu local
        </a>
      ),
    },
    {
      key: "menu",
      label: "Foto de tu carta impresa",
      ok: references.menuPhoto,
      missing: (
        <a href={links.importPhoto} className="font-semibold text-primary underline underline-offset-4">
          Subí una foto de tu carta
        </a>
      ),
    },
  ];
  const social = website.trim() !== "" && isSocialProfile(website.trim());

  return (
    <section aria-labelledby="propuesta" className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6 lg:col-start-1">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="propuesta" className="text-lg font-bold">
            Diseño a medida
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Miramos tu logo, la foto de tu local, la foto de tu carta y tu sitio web, y te proponemos colores, letras y estilo que se parezcan a tu local. Vos decidís si lo aplicás.
          </p>
        </div>
      </div>

      {proposal && (
        <div className="mt-5 rounded-lg border border-primary/30 bg-secondary/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{request?.origin === "import" ? "Te armamos una propuesta con la foto de tu carta" : "Tu propuesta está lista"}</p>
            {proposal.simulated && <SimulatedBadge />}
          </div>
          {proposal.summary && <p className="mt-1.5 text-[15px] text-pretty">{proposal.summary}</p>}
          <Swatches theme={proposal.theme} className="mt-3" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            Letras: {DISPLAY_FONTS[proposal.theme.fonts.display].label} y {BODY_FONTS[proposal.theme.fonts.body].label}
            {proposal.sources.length > 0 && <> · Usamos: {proposal.sources.map((s) => DESIGN_SOURCE_LABELS[s]).join(", ")}</>}
          </p>
          <ActionError error={apply.error} className="mt-3" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => apply.run(proposal.id)} disabled={readOnly || apply.pending}>
              {apply.pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Aplicar a mi carta
            </Button>
            <Button variant="outline" onClick={() => onAdjust(proposal.theme)} disabled={readOnly || apply.pending}>
              Ajustar antes de aplicar
            </Button>
            {!showingProposal && (
              <Button variant="ghost" onClick={onShow}>
                Ver en la vista previa
              </Button>
            )}
          </div>
        </div>
      )}
      {request?.status === "applied" && (
        <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-success" role="status">
          <Check className="size-4" aria-hidden="true" /> Aplicaste la última propuesta. Tu carta ya se ve así.
        </p>
      )}

      {inFlight && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-info/25 bg-info-surface p-4 text-info" role="status" aria-live="polite">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" aria-hidden="true" />
          <div>
            <p className="font-semibold">Estamos armando tu propuesta…</p>
            <p className="text-sm">
              {retrying ? `${retrying} Lo volvemos a intentar solo.` : "Suele tardar menos de un minuto. Podés seguir usando el panel: queda guardada acá."}
            </p>
          </div>
        </div>
      )}
      {request?.status === "failed" && (
        <Alert variant="destructive" className="mt-5">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            No pudimos armar la propuesta. {request.errorMessage ?? ""} Probá de nuevo en unos minutos.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <p className="text-sm font-bold">Con qué nos inspiramos</p>
        <ul className="mt-2 grid gap-2 text-sm">
          {refs.map((ref) => (
            <li key={ref.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {ref.ok ? <Check className="size-4 text-success" aria-hidden="true" /> : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />}
              <span className={cn(!ref.ok && "text-muted-foreground")}>{ref.label}</span>
              {!ref.ok && <span className="text-muted-foreground">·</span>}
              {!ref.ok && ref.missing}
              <span className="sr-only">{ref.ok ? "(la tenemos)" : "(falta)"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-muted-foreground">Cuantas más referencias, más se va a parecer a tu local.</p>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await ask.run(businessId, website);
        }}
      >
        <FormField
          label="Sitio web del local"
          optional
          hint={
            social
              ? "Instagram, Facebook y TikTok no se pueden leer sin iniciar sesión: lo guardamos, pero para inspirarnos usamos tus fotos."
              : "Tomamos sus colores, su letra y su imagen principal."
          }
          error={ask.fieldErrors.websiteUrl}
        >
          {(p) => (
            <Input {...p} type="url" inputMode="url" autoComplete="url" placeholder="milocal.com.ar" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={readOnly || inFlight} />
          )}
        </FormField>
        <ActionError error={ask.error && ask.error.code !== "validation" ? ask.error : null} />
        {!aiAvailable && (
          <Alert variant="info">
            <AlertDescription>Las propuestas con IA necesitan configuración. Mientras tanto podés ajustar el diseño a mano.</AlertDescription>
          </Alert>
        )}
        <div>
          <SubmitButton pending={ask.pending} pendingLabel="Pidiendo…" disabled={readOnly || inFlight || !aiAvailable} variant={proposal ? "outline" : "default"}>
            <Sparkles aria-hidden="true" /> {request ? "Proponer otro diseño" : "Proponer un diseño"}
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function Swatches({ theme, className }: { theme: MenuTheme; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-3", className)} aria-label="Colores de la propuesta">
      {THEME_COLOR_KEYS.map((key) => (
        <li key={key} className="flex items-center gap-1.5 text-[13px]">
          <span className="size-6 rounded-full border border-border shadow-xs" style={{ background: theme.colors[key] }} aria-hidden="true" />
          <span className="text-muted-foreground">{COLOR_LABELS[key].label}</span>
        </li>
      ))}
    </ul>
  );
}

function ColorField({ colorKey, value, onChange }: { colorKey: ThemeColorKey; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Si el color cambia desde afuera (propuesta, corrección), se actualiza el texto.
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const id = `color-${colorKey}`;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {COLOR_LABELS[colorKey].label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`Elegir ${COLOR_LABELS[colorKey].label.toLowerCase()}`}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
        />
        <Input
          id={id}
          value={text}
          maxLength={7}
          spellCheck={false}
          className="font-mono uppercase"
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setText(next);
            if (/^#[0-9A-F]{6}$/.test(next)) onChange(next);
          }}
          onBlur={() => setText(value)}
        />
      </div>
      <p className="text-[13px] text-muted-foreground">{COLOR_LABELS[colorKey].hint}</p>
    </div>
  );
}

function StyleSelect<T extends string>({ label, options, value, onChange }: { label: string; options: Record<T, string>; value: T; onChange: (value: T) => void }) {
  return (
    <FormField label={label}>
      {(p) => (
        <NativeSelect {...p} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {(Object.entries(options) as [T, string][]).map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}

