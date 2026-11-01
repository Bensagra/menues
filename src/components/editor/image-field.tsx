"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { publicMediaUrl } from "@/lib/media-url";
import { errorMessage } from "@/lib/errors";
import { processImageAction, requestImageUploadAction } from "@/server/actions/catalog";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 12 * 1024 * 1024;

export interface UploadedImage {
  mediaId: string;
  previewUrl: string | null;
}

/** Sube una imagen a una URL firmada, la procesa en el servidor y devuelve el medio creado. */
export async function uploadImage(businessId: string, kind: "product_image" | "logo" | "cover", file: File): Promise<{ ok: true; image: UploadedImage } | { ok: false; message: string }> {
  if (!ACCEPT.includes(file.type)) return { ok: false, message: errorMessage("invalid_file_type") };
  if (file.size > MAX_BYTES) return { ok: false, message: errorMessage("file_too_large") };
  const request = await requestImageUploadAction(businessId, kind, file.type, file.size);
  if (!request.ok) return { ok: false, message: request.error.message };
  const supabase = createBrowserSupabase();
  const { error } = await supabase.storage.from("uploads").uploadToSignedUrl(request.data.path, request.data.token, file, {
    contentType: file.type,
  });
  if (error) return { ok: false, message: errorMessage("upload_failed") };
  const processed = await processImageAction(businessId, kind, request.data.path);
  if (!processed.ok) return { ok: false, message: processed.error.message };
  return { ok: true, image: { mediaId: processed.data.mediaId, previewUrl: publicMediaUrl(processed.data.pathSm) } };
}

export function ImageField({
  businessId,
  kind = "product_image",
  label,
  previewUrl,
  onChange,
  disabled,
  aspect = "aspect-[4/3]",
}: {
  businessId: string;
  kind?: "product_image" | "logo" | "cover";
  label: string;
  previewUrl: string | null;
  onChange: (image: UploadedImage | null) => void;
  disabled?: boolean;
  aspect?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "working">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setState("working");
    const result = await uploadImage(businessId, kind, file);
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
    if (!result.ok) setMessage(result.message);
    else onChange(result.image);
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold" id={`${inputId}-label`}>
        {label} <span className="font-normal text-muted-foreground">(opcional)</span>
      </span>
      <div className="flex flex-wrap items-start gap-4">
        <div className={`flex w-36 items-center justify-center overflow-hidden rounded-lg border border-border bg-background ${aspect}`}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="grid gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT.join(",")}
            className="sr-only"
            disabled={disabled || state === "working"}
            aria-labelledby={`${inputId}-label`}
            onChange={(e) => handle(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" disabled={disabled || state === "working"} onClick={() => inputRef.current?.click()}>
            {state === "working" ? <Spinner aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {state === "working" ? "Subiendo…" : previewUrl ? "Cambiar foto" : "Subir foto"}
          </Button>
          {previewUrl && (
            <Button type="button" variant="ghost" disabled={disabled || state === "working"} onClick={() => onChange(null)}>
              <Trash2 aria-hidden="true" /> Quitar foto
            </Button>
          )}
          <p className="text-[13px] text-muted-foreground">JPG, PNG o WebP de hasta 12 MB.</p>
        </div>
      </div>
      {message && (
        <p role="alert" className="text-[13px] font-medium text-error">
          {message}
        </p>
      )}
    </div>
  );
}
