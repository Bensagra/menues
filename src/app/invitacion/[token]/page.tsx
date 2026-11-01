import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlert, Clock, MailCheck } from "lucide-react";
import { AcceptInvitationButton } from "@/components/auth/accept-invitation";
import { AuthCard } from "@/components/auth/auth-card";
import { Logo } from "@/components/app/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS, type Role } from "@/domain/permissions";
import { getCurrentUser } from "@/server/auth";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Invitación", robots: { index: false } };

type Props = PageProps<"/invitacion/[token]">;

interface Preview {
  status: "valid" | "expired" | "revoked" | "accepted" | "unavailable" | "invalid";
  business_name?: string;
  role?: Role;
  email_hint?: string;
  email_matches?: boolean;
  invited_by?: string | null;
}

export default function InvitationPage(props: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-4 sm:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center" aria-label="CartaLista, inicio">
          <Logo />
        </Link>
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
            <Invitation params={props.params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

async function Invitation({ params }: { params: Props["params"] }) {
  const { token } = await params;
  const supabase = await createClient();
  const [user, { data }] = await Promise.all([getCurrentUser(), supabase.rpc("get_invitation", { p_token: token })]);
  const preview = (data ?? { status: "invalid" }) as unknown as Preview;
  const back = `/invitacion/${token}`;

  if (preview.status !== "valid") {
    const messages: Record<string, { title: string; text: string; icon: typeof Clock }> = {
      expired: { title: "La invitación venció", text: "Pedile a quien te invitó que te envíe un enlace nuevo.", icon: Clock },
      revoked: { title: "La invitación fue cancelada", text: "Si creés que es un error, hablá con quien te invitó.", icon: CircleAlert },
      accepted: { title: "Esta invitación ya se usó", text: "Cada enlace sirve una sola vez. Si ya sos parte del equipo, ingresá a tu panel.", icon: MailCheck },
      unavailable: { title: "La cuenta no está disponible", text: "El negocio está suspendido en este momento.", icon: CircleAlert },
      invalid: { title: "El enlace no es válido", text: "Revisá que esté completo o pedí uno nuevo.", icon: CircleAlert },
    };
    const meta = messages[preview.status] ?? messages.invalid;
    const Icon = meta.icon;
    return (
      <AuthCard title={meta.title}>
        <p className="flex items-start gap-2 text-muted-foreground">
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> {meta.text}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href={user ? "/panel" : "/ingresar"}>{user ? "Ir a mi panel" : "Ingresar"}</Link>
        </Button>
      </AuthCard>
    );
  }

  const roleLabel = preview.role ? ROLE_LABELS[preview.role] : "integrante";
  return (
    <AuthCard
      title={`Sumate a ${preview.business_name}`}
      description={`${preview.invited_by ? `${preview.invited_by} te invitó` : "Te invitaron"} a CartaLista como ${roleLabel.toLowerCase()}.`}
    >
      {!user ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            La invitación es para <strong className="text-foreground">{preview.email_hint}</strong>. Ingresá o creá tu cuenta con ese email.
          </p>
          <Button asChild size="lg">
            <Link href={`/registrarse?volver=${encodeURIComponent(back)}&motivo=invitacion`}>Crear cuenta</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={`/ingresar?volver=${encodeURIComponent(back)}&motivo=invitacion`}>Ya tengo cuenta</Link>
          </Button>
        </div>
      ) : preview.email_matches ? (
        <AcceptInvitationButton token={token} />
      ) : (
        <div className="grid gap-4">
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>
              Esta invitación es para {preview.email_hint} y estás usando {user.email}. Salí e ingresá con la cuenta del email invitado.
            </AlertDescription>
          </Alert>
          <form action="/auth/salir" method="post">
            <Button type="submit" variant="outline" className="w-full">
              Cerrar sesión
            </Button>
          </form>
        </div>
      )}
    </AuthCard>
  );
}
