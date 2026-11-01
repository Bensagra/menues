import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProfileForm, PasswordForm } from "@/components/account/profile-form";
import { PageSkeleton } from "@/components/app/states";
import { SimpleShell } from "@/components/app/simple-shell";
import { requireUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Mi cuenta" };

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <SimpleShell>
          <PageSkeleton rows={2} />
        </SimpleShell>
      }
    >
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await requireUser("/cuenta");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  return (
    <SimpleShell email={user.email}>
      <Link href="/panel" className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        ← Volver al panel
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Mi cuenta</h1>
      <p className="mt-1 text-muted-foreground">{user.email}</p>
      <section aria-labelledby="perfil" className="mt-8 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 id="perfil" className="mb-4 text-lg font-bold">
          Perfil
        </h2>
        <ProfileForm fullName={profile?.full_name ?? ""} />
      </section>
      <section aria-labelledby="seguridad" className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 id="seguridad" className="mb-4 text-lg font-bold">
          Contraseña
        </h2>
        <PasswordForm />
      </section>
    </SimpleShell>
  );
}
