import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { PageSkeleton } from "@/components/app/states";
import { PANEL_NAV, SETTINGS_NAV, visibleNav } from "@/components/panel/nav";
import { Button } from "@/components/ui/button";
import { getBusinessContext, isPlatformAdmin } from "@/server/auth";

export const metadata: Metadata = { title: "Más" };

export default function MorePage(props: PageProps<"/panel/[negocio]/mas">) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <More params={props.params} />
    </Suspense>
  );
}

function Row({ href, label, icon: Icon }: { href: string; label: string; icon?: typeof UserRound }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 last:border-0 hover:bg-secondary">
        <span className="flex items-center gap-3 font-semibold">
          {Icon && <Icon className="size-5 text-primary" aria-hidden="true" />}
          {label}
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

async function More({ params }: { params: PageProps<"/panel/[negocio]/mas">["params"] }) {
  const { negocio } = await params;
  const [ctx, admin] = await Promise.all([getBusinessContext(negocio), isPlatformAdmin()]);
  const base = `/panel/${ctx.business.slug}`;
  const sections = visibleNav(ctx.permissions).filter((item) => !["inicio", "menus", "actualizar", "configuracion"].includes(item.key));
  const settings = SETTINGS_NAV.filter((item) => ctx.permissions[item.permission]);
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-bold">Más</h1>
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {sections.map((item) => (
          <Row key={item.key} href={item.href(base)} label={item.label} icon={item.icon} />
        ))}
      </ul>
      {settings.length > 0 && (
        <section aria-labelledby="config">
          <h2 id="config" className="mb-2 text-sm font-bold text-muted-foreground uppercase">
            Configuración
          </h2>
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {settings.map((item) => (
              <Row key={item.key} href={item.href(base)} label={item.label} icon={PANEL_NAV.find((n) => n.key === "configuracion")?.icon} />
            ))}
          </ul>
        </section>
      )}
      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        <Row href="/cuenta" label="Mi cuenta" icon={UserRound} />
        {admin && <Row href="/admin" label="Administración de la plataforma" icon={ShieldCheck} />}
      </ul>
      <form action="/auth/salir" method="post">
        <Button type="submit" variant="outline" className="w-full">
          <LogOut aria-hidden="true" /> Cerrar sesión
        </Button>
      </form>
    </div>
  );
}
