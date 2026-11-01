"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, RotateCcw, RotateCw, Trash2, TriangleAlert, Upload } from "lucide-react";
import { ActionError, SubmitButton } from "@/components/app/form";
import { NativeSelect } from "@/components/app/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { appError, type AppError } from "@/lib/errors";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { prepareImportAction, submitImportAction } from "@/server/actions/imports";

interface MenuOption {
  id: string;
  name: string;
  branchIds: string[];
  categories: { id: string; name: string }[];
}

interface Page {
  key: string;
  file: File;
  url: string;
  rotation: 0 | 90 | 180 | 270;
  hash: string;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const SCOPES = [
  { value: "full", label: "Carta completa", hint: "Precios, productos nuevos, descripciones y variantes. Nada se borra si no aparece en la foto." },
  { value: "categories", label: "Categorías seleccionadas", hint: "Solo se analizan los productos de las categorías que elijas." },
  { value: "prices_only", label: "Solo precios", hint: "Solo se actualizan precios de productos que ya están en tu carta. No cambia nombres ni agrega productos." },
] as const;

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ImportUploader({
  base,
  menus,
  branches,
  defaultBranchId,
  maxPages,
  remaining,
  maxBytes,
}: {
  base: string;
  menus: MenuOption[];
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
  maxPages: number;
  remaining: number;
  maxBytes: number;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pages, setPages] = useState<Page[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const firstMenu = menus.find((m) => defaultBranchId && m.branchIds.includes(defaultBranchId)) ?? menus[0];
  const [menuId, setMenuId] = useState(firstMenu?.id ?? "");
  const menu = menus.find((m) => m.id === menuId);
  const menuBranches = branches.filter((b) => menu?.branchIds.includes(b.id));
  const [branchIds, setBranchIds] = useState<string[]>(() => {
    const ids = firstMenu?.branchIds ?? [];
    return defaultBranchId && ids.includes(defaultBranchId) ? (ids.length === 1 ? ids : [defaultBranchId]) : ids.slice(0, 1);
  });
  const [scope, setScope] = useState<(typeof SCOPES)[number]["value"]>("full");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "validating">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<AppError | null>(null);
  const limit = Math.min(maxPages, remaining);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const errors: string[] = [];
    const next: Page[] = [];
    for (const file of Array.from(list)) {
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
        errors.push(`«${file.name}» está en formato HEIC. Elegí la foto como JPG (en el iPhone: Ajustes › Cámara › Formatos › Más compatible).`);
        continue;
      }
      if (!ACCEPT.includes(file.type)) {
        errors.push(`«${file.name}» no es una imagen compatible. Usá JPG, PNG o WebP.`);
        continue;
      }
      if (file.size > maxBytes) {
        errors.push(`«${file.name}» pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB. Probá con una foto más liviana.`);
        continue;
      }
      const hash = await sha256(file);
      if ([...pages, ...next].some((p) => p.hash === hash)) {
        errors.push(`«${file.name}» ya está en la lista.`);
        continue;
      }
      next.push({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file), rotation: 0, hash });
    }
    setPages((current) => {
      const merged = [...current, ...next];
      if (merged.length > limit) {
        errors.push(`Podés procesar hasta ${limit} ${limit === 1 ? "foto" : "fotos"} en esta importación.`);
        merged.slice(limit).forEach((p) => URL.revokeObjectURL(p.url));
        return merged.slice(0, limit);
      }
      return merged;
    });
    setFileErrors(errors);
  }

  const move = (index: number, delta: number) =>
    setPages((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  const rotate = (key: string, delta: 90 | -90) =>
    setPages((list) => list.map((p) => (p.key === key ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 as Page["rotation"] } : p)));
  const remove = (key: string) =>
    setPages((list) => {
      const page = list.find((p) => p.key === key);
      if (page) URL.revokeObjectURL(page.url);
      return list.filter((p) => p.key !== key);
    });

  const canSubmit = pages.length > 0 && menu && branchIds.length > 0 && (scope !== "categories" || categoryIds.length > 0) && phase === "idle";
  const scopeCategories = menu?.categories ?? [];

  async function submit() {
    if (!menu) return;
    setError(null);
    setPhase("uploading");
    setProgress(0);
    try {
      const prepared = await prepareImportAction({
        menuId: menu.id,
        branchIds,
        scope,
        categoryIds: scope === "categories" ? categoryIds : [],
        files: pages.map((p) => ({ name: p.file.name, type: p.file.type as "image/jpeg", size: p.file.size })),
        idempotencyKey,
      });
      if (!prepared.ok) {
        setError(prepared.error);
        setPhase("idle");
        return;
      }
      if (prepared.data.submitted) {
        router.push(`${base}/actualizar/${prepared.data.importId}`);
        return;
      }
      const supabase = createBrowserSupabase();
      let done = 0;
      for (const [index, upload] of prepared.data.uploads.entries()) {
        const page = pages[index];
        const { error: uploadError } = await supabase.storage
          .from("import-originals")
          .uploadToSignedUrl(upload.path, upload.token, page.file, { contentType: page.file.type, upsert: true });
        if (uploadError) {
          setError(appError("upload_failed", `Foto ${index + 1}`));
          setPhase("idle");
          return;
        }
        done += 1;
        setProgress(done);
      }
      setPhase("validating");
      const submitted = await submitImportAction({
        importId: prepared.data.importId,
        pages: prepared.data.uploads.map((u, index) => ({ imageId: u.imageId, rotation: pages[index].rotation })),
      });
      if (!submitted.ok) {
        setError(submitted.error.detail ? { ...submitted.error, message: `${submitted.error.message}${submitted.error.detail.startsWith("Foto") ? ` (${submitted.error.detail})` : ""}` } : submitted.error);
        setPhase("idle");
        return;
      }
      router.push(`${base}/actualizar/${submitted.data.importId}`);
    } catch {
      setError(appError("network"));
      setPhase("idle");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-labelledby="fotos" className="grid content-start gap-4">
        <h2 id="fotos" className="text-base font-bold">
          1. Fotos de la carta
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors",
            dragging ? "border-primary bg-secondary" : "border-[#cdd3c9]",
          )}
        >
          <ImagePlus className="size-8 text-primary" aria-hidden="true" />
          <p className="mt-3 font-semibold">Sacá una foto o elegí imágenes de cada página</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Que se lean bien los precios: buena luz, sin reflejos y la página entera. <span className="hidden sm:inline">También podés arrastrarlas acá.</span>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <input
              ref={cameraRef}
              type="file"
              accept={ACCEPT.join(",")}
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={pickerRef}
              type="file"
              accept={ACCEPT.join(",")}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button type="button" onClick={() => cameraRef.current?.click()} className="[@media(pointer:fine)]:hidden" disabled={phase !== "idle"}>
              <Camera aria-hidden="true" /> Usar la cámara
            </Button>
            <Button type="button" variant="outline" onClick={() => pickerRef.current?.click()} disabled={phase !== "idle"}>
              <Upload aria-hidden="true" /> Elegir fotos
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            JPG, PNG o WebP · hasta {Math.round(maxBytes / 1024 / 1024)} MB cada una · hasta {limit} {limit === 1 ? "foto" : "fotos"}
          </p>
        </div>

        {fileErrors.length > 0 && (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              <ul className="grid gap-1">
                {fileErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {pages.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Fotos en orden de página">
            {pages.map((page, index) => (
              <li key={page.key} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden bg-[#ebe8df]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.url}
                    alt={`Página ${index + 1}: ${page.file.name}`}
                    className="max-h-full max-w-full object-contain transition-transform motion-reduce:transition-none"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                  <span className="absolute top-2 left-2 rounded-md bg-card px-2 py-0.5 text-xs font-bold shadow-sm">Página {index + 1}</span>
                </div>
                <div className="grid grid-cols-5 border-t border-border">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0 || phase !== "idle"} onClick={() => move(index, -1)} aria-label={`Mover la página ${index + 1} antes`}>
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === pages.length - 1 || phase !== "idle"} onClick={() => move(index, 1)} aria-label={`Mover la página ${index + 1} después`}>
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={phase !== "idle"} onClick={() => rotate(page.key, -90)} aria-label={`Girar la página ${index + 1} a la izquierda`}>
                    <RotateCcw aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={phase !== "idle"} onClick={() => rotate(page.key, 90)} aria-label={`Girar la página ${index + 1} a la derecha`}>
                    <RotateCw aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={phase !== "idle"} onClick={() => remove(page.key)} aria-label={`Quitar la página ${index + 1}`}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="alcance" className="grid content-start gap-5 rounded-xl border border-border bg-card p-5">
        <h2 id="alcance" className="text-base font-bold">
          2. Qué querés actualizar
        </h2>
        <div className="grid gap-1.5">
          <label htmlFor="menu" className="text-sm font-semibold">
            Carta
          </label>
          <NativeSelect
            id="menu"
            value={menuId}
            disabled={phase !== "idle"}
            onChange={(e) => {
              const next = menus.find((m) => m.id === e.target.value);
              setMenuId(e.target.value);
              setBranchIds(next?.branchIds.slice(0, 1) ?? []);
              setCategoryIds([]);
            }}
          >
            {menus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        {menuBranches.length > 1 ? (
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-semibold">Sucursales</legend>
            {menuBranches.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={branchIds.includes(b.id)}
                  disabled={phase !== "idle"}
                  onCheckedChange={(checked) => setBranchIds((s) => (checked ? [...s, b.id] : s.filter((id) => id !== b.id)))}
                />
                {b.name}
              </label>
            ))}
            <p className="text-[13px] text-muted-foreground">
              Si no elegís todas, los precios nuevos quedan como precios propios de las sucursales elegidas.
            </p>
          </fieldset>
        ) : (
          menuBranches[0] && <p className="text-sm text-muted-foreground">Sucursal: {menuBranches[0].name}</p>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Alcance</legend>
          <RadioGroup value={scope} onValueChange={(v) => setScope(v as typeof scope)} className="grid gap-2" disabled={phase !== "idle"}>
            {SCOPES.map((s) => (
              <label key={s.value} className={cn("flex items-start gap-3 rounded-lg border p-3", scope === s.value ? "border-primary bg-secondary" : "border-border")}>
                <RadioGroupItem value={s.value} className="mt-0.5" />
                <span>
                  <span className="font-semibold">{s.label}</span>
                  <span className="block text-[13px] text-muted-foreground">{s.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {scope === "categories" && (
            <div className="grid gap-1 rounded-lg border border-border p-3">
              {scopeCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta carta todavía no tiene categorías. Usá «Carta completa».</p>
              ) : (
                scopeCategories.map((c) => (
                  <label key={c.id} className="flex min-h-11 items-center gap-3">
                    <Checkbox
                      checked={categoryIds.includes(c.id)}
                      onCheckedChange={(checked) => setCategoryIds((s) => (checked ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          )}
        </fieldset>

        <ActionError error={error} />
        <div className="grid gap-2">
          <SubmitButton
            type="button"
            size="lg"
            pending={phase !== "idle"}
            pendingLabel={phase === "uploading" ? `Subiendo ${progress} de ${pages.length}…` : "Verificando las fotos…"}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            Procesar {pages.length > 0 ? `${pages.length} ${pages.length === 1 ? "foto" : "fotos"}` : "fotos"}
          </SubmitButton>
          <p className="text-[13px] text-muted-foreground">
            Nada se publica automáticamente: vas a revisar cada cambio antes de aplicarlo. Podés cerrar esta página mientras se procesa.
          </p>
        </div>
      </section>
    </div>
  );
}
