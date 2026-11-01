import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { RequestResetForm } from "@/components/auth/recovery-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <AuthCard
      title="Recuperá tu contraseña"
      description="Te enviamos un enlace para elegir una nueva."
      footer={
        <Link href="/ingresar" className="font-semibold text-primary underline-offset-4 hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      <RequestResetForm />
    </AuthCard>
  );
}
