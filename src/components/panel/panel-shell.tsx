import Link from "next/link";
import type { ReactNode } from "react";
import { OctagonAlert } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROLE_LABELS } from "@/domain/permissions";
import type { BusinessContext } from "@/server/auth";
import { BranchSwitcher } from "./branch-switcher";
import { BottomNav, SidebarNav } from "./panel-nav";
import { UserMenu } from "./user-menu";

export function PanelShell({ ctx, isAdmin, children }: { ctx: BusinessContext; isAdmin: boolean; children: ReactNode }) {
  const base = `/panel/${ctx.business.slug}`;
  const branches = ctx.branches.map((b) => ({ id: b.id, name: b.name }));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>

      <aside className="hidden border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="px-5 pt-5 pb-4">
          <Link href={base} className="inline-flex min-h-11 items-center" aria-label="Inicio del panel">
            <Logo />
          </Link>
        </div>
        <div className="mx-3 mb-3 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">Negocio</p>
          <p className="truncate font-bold" title={ctx.business.name}>
            {ctx.business.name}
          </p>
          <div className="mt-2">
            <BranchSwitcher businessId={ctx.business.id} branches={branches} activeBranchId={ctx.activeBranch?.id ?? null} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav base={base} permissions={ctx.permissions} />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu email={ctx.user.email} isAdmin={isAdmin} roleLabel={ROLE_LABELS[ctx.scope.role]} />
        </div>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-border bg-card lg:hidden">
          <div className="flex items-center gap-3 px-4 py-2">
            <Link href={base} aria-label="Inicio del panel" className="inline-flex min-h-11 items-center">
              <Logo compact />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{ctx.business.name}</p>
              {branches.length <= 1 && <p className="truncate text-xs text-muted-foreground">{ctx.activeBranch?.name}</p>}
            </div>
            {branches.length > 1 && (
              <div className="w-40 shrink-0">
                <BranchSwitcher businessId={ctx.business.id} branches={branches} activeBranchId={ctx.activeBranch?.id ?? null} compact />
              </div>
            )}
          </div>
        </header>

        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
          {ctx.suspended && (
            <Alert variant="destructive" className="mb-6">
              <OctagonAlert aria-hidden="true" />
              <AlertTitle>La cuenta está suspendida</AlertTitle>
              <AlertDescription>
                Tu carta pública no se muestra y el panel está en modo de solo lectura.
                {ctx.business.suspended_reason ? ` Motivo: ${ctx.business.suspended_reason}.` : ""} Escribinos para reactivarla.
              </AlertDescription>
            </Alert>
          )}
          {children}
        </main>
      </div>

      <BottomNav base={base} permissions={ctx.permissions} />
    </div>
  );
}

export function PanelShellFallback({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-border bg-card lg:block" aria-hidden="true">
        <div className="px-5 pt-5">
          <Logo />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
