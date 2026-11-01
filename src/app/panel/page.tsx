import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/app/states";
import { SimpleShell } from "@/components/app/simple-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/domain/permissions";
import { getUserBusinesses, isPlatformAdmin, requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Tus negocios" };

export default function PanelIndex(props: PageProps<"/panel">) {
  return (
    <Suspense
      fallback={
        <SimpleShell>
          <PageSkeleton rows={3} />
        </SimpleShell>
      }
    >
      <PanelResolver searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PanelResolver({ searchParams }: { searchParams: PageProps<"/panel">["searchParams"] }) {
  const user = await requireUser("/panel");
  const params = await searchParams;
  const [businesses, admin] = await Promise.all([getUserBusinesses(), isPlatformAdmin()]);
  if (businesses.length === 1 && !admin && params.elegir !== "1") redirect(`/panel/${businesses[0].slug}`);
  if (businesses.length === 0 && !admin) redirect("/bienvenida");

  return (
    <SimpleShell email={user.email}>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Tus negocios</h1>
      {admin && (
        <Link
          href="/admin"
          className="mt-6 flex min-h-11 items-center justify-between rounded-xl border border-info/25 bg-info-surface p-4 font-semibold text-info"
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" /> Administración de la plataforma
          </span>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Link>
      )}
      <ul className="mt-6 grid gap-3">
        {businesses.map((b) => (
          <li key={b.slug}>
            <Link
              href={`/panel/${b.slug}`}
              className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-secondary"
            >
              <span>
                <span className="block font-bold">{b.name}</span>
                <span className="text-sm text-muted-foreground">{ROLE_LABELS[b.role]}</span>
              </span>
              <span className="flex items-center gap-2">
                {b.status === "suspended" && <Badge variant="destructive">Suspendida</Badge>}
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/bienvenida?nuevo=1">
          <Plus aria-hidden="true" /> Crear otro negocio
        </Link>
      </Button>
    </SimpleShell>
  );
}
