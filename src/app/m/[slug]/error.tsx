"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MenuError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-error-surface text-error">
        <WifiOff className="size-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-semibold tracking-tight">No pudimos cargar la carta</h1>
      <p className="mt-3 text-muted-foreground">Puede ser un problema de conexión. Revisá tu señal o wifi y probá de nuevo.</p>
      <Button className="mt-6" size="lg" onClick={() => reset()}>
        Reintentar
      </Button>
    </main>
  );
}
