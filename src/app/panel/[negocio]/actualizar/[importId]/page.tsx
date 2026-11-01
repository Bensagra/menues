import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ban, OctagonAlert, PencilLine, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ImportStatusBadge } from "@/components/app/status";
import { PageSkeleton } from "@/components/app/states";
import { ImportProgress } from "@/components/imports/import-progress";
import { ImportReview } from "@/components/imports/import-review";
import { RetryImportButton } from "@/components/imports/retry-button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/time";
import { publicEnv } from "@/lib/env";
import { getBusinessContext } from "@/server/auth";
import { getImportDetail } from "@/server/queries/imports";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Revisar cambios" };

type Props = PageProps<"/panel/[negocio]/actualizar/[importId]">;

const SCOPE_LABEL: Record<string, string> = { full: "Carta completa", categories: "Categorías seleccionadas", prices_only: "Solo precios" };

export default function ImportPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={5} />}>
      <ImportContent params={props.params} />
    </Suspense>
  );
}

async function ImportContent({ params }: { params: Props["params"] }) {
  const { negocio, importId } = await params;
  const ctx = await getBusinessContext(negocio);
  const detail = await getImportDetail(ctx, importId);
  const imp = detail.import;
  const base = `/panel/${ctx.business.slug}`;
  const tz = ctx.activeBranch?.timezone ?? "America/Argentina/Buenos_Aires";
  const supabase = await createClient();
  const { data: processing } = await supabase.rpc("get_processing_status");
  const workerOnline = Boolean((processing as { worker_online?: boolean } | null)?.worker_online);
  const branchNames = ctx.branches.filter((b) => detail.branchIds.includes(b.id)).map((b) => b.name);

  return (
    <>
      <PageHeader
        back={{ href: `${base}/actualizar`, label: "Actualizar con foto" }}
        title={imp.status === "needs_review" ? "Revisá los cambios" : "Actualización con foto"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ImportStatusBadge status={imp.status} retrying={imp.stage === "retry_wait"} />
            <span>
              {detail.menuName} · {branchNames.join(", ")} · {SCOPE_LABEL[imp.scope]} · {imp.page_count} {imp.page_count === 1 ? "foto" : "fotos"} ·{" "}
              {formatDateTime(imp.created_at, tz)}
              {detail.createdByName ? ` · ${detail.createdByName}` : ""}
            </span>
          </span>
        }
      />

      {(imp.status === "pending" || imp.status === "processing" || imp.status === "uploading") && (
        <ImportProgress
          importId={imp.id}
          initial={{
            status: imp.status,
            stage: imp.stage,
            stage_page: imp.stage_page,
            page_count: imp.page_count,
            attempts: imp.attempts,
            max_attempts: imp.max_attempts,
            error_message: imp.error_message,
            next_attempt_at: imp.next_attempt_at,
            workerOnline,
          }}
        />
      )}

      {imp.status === "failed" && (
        <Alert variant="destructive">
          <OctagonAlert aria-hidden="true" />
          <AlertTitle>No pudimos procesar las fotos</AlertTitle>
          <AlertDescription>
            {imp.error_message ?? "Ocurrió un error al procesar."} Tu carta no cambió.
          </AlertDescription>
          <AlertAction>
            {!ctx.suspended && <RetryImportButton importId={imp.id} />}
            <Button asChild variant="outline">
              <Link href={`${base}/actualizar`}>
                <RefreshCw aria-hidden="true" /> Subir otras fotos
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`${base}/menus/${imp.menu_id}`}>
                <PencilLine aria-hidden="true" /> Editar a mano
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {imp.status === "cancelled" && (
        <Alert>
          <Ban aria-hidden="true" />
          <AlertTitle>Importación cancelada</AlertTitle>
          <AlertDescription>No se aplicó ningún cambio y no se consumió cuota.</AlertDescription>
          <AlertAction>
            <Button asChild variant="outline">
              <Link href={`${base}/actualizar`}>Subir fotos de nuevo</Link>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {(imp.status === "needs_review" || imp.status === "completed") && (
        <ImportReview
          detail={detail}
          env={{
            base,
            currency: ctx.business.currency,
            locale: ctx.business.locale,
            canPublish: ctx.permissions["catalog.publish"],
            readOnly: ctx.suspended,
            appUrl: publicEnv().appUrl,
            branchSlugs: Object.fromEntries(ctx.branches.map((b) => [b.id, b.public_slug])),
            accessibleBranchIds: ctx.branches.map((b) => b.id),
          }}
        />
      )}
    </>
  );
}
