import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, ReasonNotice } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage(props: PageProps<"/ingresar">) {
  return (
    <AuthCard
      title="Ingresá a tu cuenta"
      description="Administrá tu carta, publicá cambios y compartí tu QR."
      footer={
        <Suspense fallback={null}>
          <SignupLink searchParams={props.searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <LoginContent searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}

type SP = PageProps<"/ingresar">["searchParams"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function LoginContent({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  return (
    <>
      <ReasonNotice reason={first(params.motivo)} />
      <LoginForm next={first(params.volver)} defaultEmail={first(params.email) ?? ""} />
    </>
  );
}

async function SignupLink({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const volver = first(params.volver);
  const href = volver ? `/registrarse?volver=${encodeURIComponent(volver)}` : "/registrarse";
  return (
    <p>
      ¿No tenés cuenta?{" "}
      <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
        Creá una gratis
      </Link>
    </p>
  );
}
