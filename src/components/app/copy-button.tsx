"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copiar enlace", variant = "outline" }: { value: string; label?: string; variant?: "outline" | "default" | "ghost" }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Enlace copiado" : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Enlace copiado al portapapeles" : ""}
      </span>
      {failed && <span className="text-[13px] text-error">No se pudo copiar. Seleccioná el enlace y copialo a mano.</span>}
    </>
  );
}
