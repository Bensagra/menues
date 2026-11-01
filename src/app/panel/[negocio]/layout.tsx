import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/states";
import { PanelShell, PanelShellFallback } from "@/components/panel/panel-shell";
import { getBusinessContext, isPlatformAdmin } from "@/server/auth";

export default function BusinessLayout({ children, params }: LayoutProps<"/panel/[negocio]">) {
  return (
    <Suspense
      fallback={
        <PanelShellFallback>
          <PageSkeleton />
        </PanelShellFallback>
      }
    >
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ params, children }: { params: LayoutProps<"/panel/[negocio]">["params"]; children: React.ReactNode }) {
  const { negocio } = await params;
  const [ctx, admin] = await Promise.all([getBusinessContext(negocio), isPlatformAdmin()]);
  return (
    <PanelShell ctx={ctx} isAdmin={admin}>
      {children}
    </PanelShell>
  );
}
