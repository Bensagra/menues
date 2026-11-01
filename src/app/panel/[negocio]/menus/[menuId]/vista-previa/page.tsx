import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Eye } from "lucide-react";
import { PageSkeleton } from "@/components/app/states";
import { PublicMenu } from "@/components/menu/public-menu";
import { PreviewBranchSelect } from "@/components/menu/preview-branch-select";
import { Button } from "@/components/ui/button";
import { parseSnapshot } from "@/domain/snapshot";
import type { OpeningInterval } from "@/domain/time";
import { getBusinessContext } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Vista previa del borrador" };

type Props = PageProps<"/panel/[negocio]/menus/[menuId]/vista-previa">;

export default function PreviewPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Preview params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Preview({ params, searchParams }: { params: Props["params"]; searchParams: Props["searchParams"] }) {
  const { negocio, menuId } = await params;
  const sp = await searchParams;
  const ctx = await getBusinessContext(negocio);
  const supabase = await createClient();

  const { data: links } = await supabase.from("menu_branches").select("branch_id").eq("menu_id", menuId);
  const branchIds = (links ?? []).map((l) => l.branch_id);
  const branches = ctx.branches.filter((b) => branchIds.includes(b.id));
  if (!branches.length) notFound();
  const requested = typeof sp.sucursal === "string" ? sp.sucursal : null;
  const branch = branches.find((b) => b.id === requested) ?? branches.find((b) => b.id === ctx.activeBranch?.id) ?? branches[0];

  const [{ data: snapshot, error }, { data: business }, { data: branchRow }] = await Promise.all([
    supabase.rpc("get_draft_snapshot", { p_menu_id: menuId, p_branch_id: branch.id }),
    supabase
      .from("businesses")
      .select("id, name, description, brand_color, currency, locale, logo:media!businesses_logo_fk(path_sm, path_lg, width, height), cover:media!businesses_cover_fk(path_sm, path_lg, width, height)")
      .eq("id", ctx.business.id)
      .single(),
    supabase.from("branches").select("*").eq("id", branch.id).single(),
  ]);
  if (error || !snapshot || !business || !branchRow) notFound();
  const toMedia = (m: unknown) => {
    const media = m as { path_sm: string; path_lg: string; width: number; height: number } | null;
    return media ? { sm: media.path_sm, lg: media.path_lg, w: media.width, h: media.height } : null;
  };

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-10 lg:-my-8">
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-info/25 bg-info-surface px-4 py-2 text-info sm:px-6" role="status">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="size-4" aria-hidden="true" /> Vista previa del borrador: tus clientes todavía no ven estos cambios.
        </p>
        <div className="flex items-center gap-2">
          {branches.length > 1 && <PreviewBranchSelect branches={branches.map((b) => ({ id: b.id, name: b.name }))} value={branch.id} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`/panel/${ctx.business.slug}/menus/${menuId}`}>Volver al editor</Link>
          </Button>
        </div>
      </div>
      <PublicMenu
        data={{
          business: {
            id: business.id,
            name: business.name,
            description: business.description,
            brand_color: business.brand_color,
            currency: business.currency,
            locale: business.locale,
            logo: toMedia(business.logo),
            cover: toMedia(business.cover),
          },
          branch: {
            id: branchRow.id,
            name: branchRow.name,
            public_slug: branchRow.public_slug,
            address: branchRow.address,
            phone: branchRow.phone,
            whatsapp: branchRow.whatsapp,
            public_note: branchRow.public_note,
            timezone: branchRow.timezone,
            opening_hours: branchRow.opening_hours as unknown as OpeningInterval[],
            other_branches: [],
          },
          menus: [{ menu_id: menuId, kind: "regular", version_number: null, published_at: null, snapshot: parseSnapshot(snapshot) }],
          // Las promociones no forman parte del borrador: se programan aparte.
          promotions: [],
        }}
        serverNow={await requestTime()}
      />
    </div>
  );
}
