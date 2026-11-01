import Link from "next/link";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/app/logo";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { requirePlatformAdmin } from "@/server/admin";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8">
          <PageSkeleton />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  if (!admin) {
    return (
      <main id="contenido" className="mx-auto max-w-xl px-4 py-16">
        <RestrictedState description="Esta sección es solo para administradores de la plataforma." backHref="/panel" />
      </main>
    );
  }
  return (
    <div className="min-h-dvh">
      <header className="border-b border-info/25 bg-info-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-3" aria-label="Administración, resumen">
            <Logo compact />
            <span className="flex items-center gap-1.5 text-sm font-bold text-info">
              <ShieldCheck className="size-4" aria-hidden="true" /> Administración de la plataforma
            </span>
          </Link>
          <span className="text-sm text-info">
            {admin.user.email} ·{" "}
            <Link href="/panel" className="font-semibold underline underline-offset-4">
              Salir de administración
            </Link>
          </span>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-8">
        <aside className="min-w-0">
          <AdminNav />
        </aside>
        <main id="contenido" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
