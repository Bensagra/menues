import { SearchX } from "lucide-react";

export default function MenuNotFound() {
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <SearchX className="size-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-semibold tracking-tight">No encontramos esta carta</h1>
      <p className="mt-3 text-muted-foreground">Revisá que el enlace esté completo o volvé a escanear el código QR del local.</p>
    </main>
  );
}
