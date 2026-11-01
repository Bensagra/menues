"use client";

import { ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      description="Puede ser un problema de conexión o un error momentáneo. Tus cambios guardados no se perdieron."
      action={
        <Button variant="outline" onClick={() => reset()}>
          Reintentar
        </Button>
      }
    />
  );
}
