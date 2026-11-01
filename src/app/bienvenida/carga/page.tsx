import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Camera, PencilLine, Settings2 } from "lucide-react";
import { PageSkeleton } from "@/components/app/states";
import { SimpleShell } from "@/components/app/simple-shell";
import { getBusinessContext } from "@/server/auth";
import { getAiAvailability } from "@/server/ai-availability";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "¿Cómo querés cargar tu carta?" };

export default function ChooseLoadPage(props: PageProps<"/bienvenida/carga">) {
  return (
    <Suspense
      fallback={
        <SimpleShell>
          <PageSkeleton rows={2} />
        </SimpleShell>
      }
    >
      <ChooseLoad searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ChooseLoad({ searchParams }: { searchParams: PageProps<"/bienvenida/carga">["searchParams"] }) {
  const params = await searchParams;
  const slug = typeof params.negocio === "string" ? params.negocio : null;
  if (!slug) notFound();
  const ctx = await getBusinessContext(slug);
  const supabase = await createClient();
  const { data: menu } = await supabase
    .from("menus")
    .select("id")
    .eq("business_id", ctx.business.id)
    .eq("status", "active")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  const ai = await getAiAvailability();
  const base = `/panel/${ctx.business.slug}`;

  return (
    <SimpleShell email={ctx.user.email}>
      <p className="text-sm font-semibold text-terracota">Paso 2 de 2</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">¿Cómo querés cargar tu carta?</h1>
      <p className="mt-2 text-muted-foreground">Podés combinar ambas: empezar con fotos y corregir a mano.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ai.available ? (
          <Link
            href={`${base}/actualizar`}
            className="group rounded-xl border-2 border-primary bg-card p-6 transition-colors hover:bg-secondary"
          >
            <Camera className="size-7 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold">Subí fotos de tu carta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leemos las fotos y te proponemos categorías, productos y precios. Vos revisás y publicás.
            </p>
            <span className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">Subir fotos →</span>
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-[#cdd3c9] bg-[#f1efe8] p-6">
            <div className="flex items-start justify-between gap-3">
              <Settings2 className="size-7 text-muted-foreground" aria-hidden="true" />
              <Badge variant="muted">No disponible por ahora</Badge>
            </div>
            <h2 className="mt-4 text-lg font-bold text-muted-foreground">Subí fotos de tu carta</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              El procesamiento con IA necesita configuración (clave de xAI en el servidor). Mientras tanto, cargá la carta a mano: después vas a poder
              actualizarla con fotos.
            </p>
          </div>
        )}
        <Link
          href={menu ? `${base}/menus/${menu.id}` : `${base}/menus`}
          className={`group rounded-xl bg-card p-6 transition-colors hover:bg-secondary ${ai.available ? "border border-border" : "border-2 border-primary"}`}
        >
          <PencilLine className="size-7 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold">Cargala a mano</h2>
          <p className="mt-1 text-sm text-muted-foreground">Creá categorías y productos con precios, variantes y fotos opcionales.</p>
          <span className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">Empezar a cargar →</span>
        </Link>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        <Link href={base} className="font-semibold text-primary underline-offset-4 hover:underline">
          Ir al panel
        </Link>
      </p>
    </SimpleShell>
  );
}
