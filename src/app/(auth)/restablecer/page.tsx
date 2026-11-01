import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/recovery-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Elegí una contraseña nueva" };

export default function ResetPage() {
  return (
    <AuthCard title="Elegí una contraseña nueva">
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ResetContent />
      </Suspense>
    </AuthCard>
  );
}

async function ResetContent() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="grid gap-4">
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>El enlace para restablecer la contraseña venció o ya se usó. Pedí uno nuevo.</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/recuperar">Pedir un enlace nuevo</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">Cuenta: {user.email}</p>
      <ResetPasswordForm />
    </>
  );
}
