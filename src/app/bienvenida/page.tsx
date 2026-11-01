import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BusinessForm } from "@/components/onboarding/business-form";
import { PendingInvitations } from "@/components/onboarding/pending-invitations";
import { PageSkeleton } from "@/components/app/states";
import { SimpleShell } from "@/components/app/simple-shell";
import { publicEnv } from "@/lib/env";
import { supportedTimezones } from "@/domain/time";
import { getUserBusinesses, requireUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Creá tu negocio" };

export default function WelcomePage(props: PageProps<"/bienvenida">) {
  return (
    <Suspense
      fallback={
        <SimpleShell>
          <PageSkeleton />
        </SimpleShell>
      }
    >
      <Welcome searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/bienvenida">["searchParams"] }) {
  const user = await requireUser("/bienvenida");
  const params = await searchParams;
  const businesses = await getUserBusinesses();
  if (businesses.length > 0 && params.nuevo !== "1") redirect("/panel");

  const supabase = await createClient();
  const { data: invitations } = await supabase.rpc("my_pending_invitations");

  return (
    <SimpleShell email={user.email}>
      <div className="grid gap-8">
        <div>
          <p className="text-sm font-semibold text-terracota">Paso 1 de 2</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Creá tu negocio</h1>
          <p className="mt-2 text-muted-foreground">
            Con esto armamos tu panel y la dirección permanente de tu carta. Después elegís cómo cargarla.
          </p>
        </div>
        <PendingInvitations invitations={invitations ?? []} />
        <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
          <BusinessForm appUrl={publicEnv().appUrl} timezones={supportedTimezones()} />
        </div>
        {businesses.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <Link href="/panel" className="font-semibold text-primary underline-offset-4 hover:underline">
              Volver a mis negocios
            </Link>
          </p>
        )}
      </div>
    </SimpleShell>
  );
}
