import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { CircleAlert, Lock, SearchX, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-[#cdd3c9] bg-card px-6 py-10 text-center", className)}>
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-bold text-balance">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

export function ErrorState({
  title = "No pudimos cargar esta sección",
  description = "Puede ser un problema de conexión. Probá de nuevo en unos segundos.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-error/25 bg-error-surface px-6 py-10 text-center text-error">
      <CircleAlert className="mb-3 size-7" aria-hidden="true" />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function RestrictedState({
  title = "Acceso restringido",
  description = "Tu rol no permite ver esta sección. Si la necesitás, pedile acceso a quien administra el negocio.",
  backHref,
}: {
  title?: string;
  description?: string;
  backHref?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-10 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#efece4] text-muted-foreground">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {backHref && (
        <Button asChild variant="outline" className="mt-5">
          <Link href={backHref}>Volver al inicio</Link>
        </Button>
      )}
    </div>
  );
}

export function NotFoundState({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
        <SearchX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-6">
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

/** Esqueleto genérico de página mientras carga (estado "Cargando"). */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
