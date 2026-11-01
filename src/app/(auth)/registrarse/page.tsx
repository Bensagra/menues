import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, ReasonNotice } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Crear cuenta" };

type SP = PageProps<"/registrarse">["searchParams"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function SignupPage(props: PageProps<"/registrarse">) {
  return (
    <AuthCard
      title="Creá tu cuenta"
      description="Armá tu carta digital en minutos. Sin tarjeta de crédito."
      footer={
        <Suspense fallback={null}>
          <LoginLink searchParams={props.searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <SignupContent searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignupContent({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  return (
    <>
      <ReasonNotice reason={first(params.motivo)} />
      <SignupForm next={first(params.volver)} defaultEmail={first(params.email) ?? ""} />
    </>
  );
}

async function LoginLink({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const volver = first(params.volver);
  return (
    <p>
      ¿Ya tenés cuenta?{" "}
      <Link
        href={volver ? `/ingresar?volver=${encodeURIComponent(volver)}` : "/ingresar"}
        className="font-semibold text-primary underline-offset-4 hover:underline"
      >
        Ingresá
      </Link>
    </p>
  );
}
