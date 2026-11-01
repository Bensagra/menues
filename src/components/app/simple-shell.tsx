import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

/** Encabezado simple para pantallas fuera del panel (onboarding, selección de negocio). */
export function SimpleShell({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link href="/panel" className="inline-flex min-h-11 items-center" aria-label="CartaLista, panel">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {email && <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>}
            <form action="/auth/salir" method="post">
              <Button variant="ghost" size="sm" type="submit">
                <LogOut aria-hidden="true" />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
