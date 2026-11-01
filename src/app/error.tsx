"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <CircleAlert className="mb-4 size-10 text-error" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="mt-2 text-muted-foreground">Puede ser un problema de conexión. Probá de nuevo en unos segundos.</p>
      <Button className="mt-6" onClick={() => reset()}>
        Reintentar
      </Button>
    </main>
  );
}
