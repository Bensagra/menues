import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton, RestrictedState } from "@/components/app/states";
import { DesignStudio, type DesignRequestView } from "@/components/design/design-studio";
import type { PublicMenuData } from "@/components/menu/types";
import { DESIGN_SOURCES, type DesignSource } from "@/domain/design-proposal";
import { parseSnapshot, type MenuSnapshot } from "@/domain/snapshot";
import { parseTheme } from "@/domain/theme";
import type { OpeningInterval } from "@/domain/time";
import { getAiAvailability } from "@/server/ai-availability";
import { getBusinessContext } from "@/server/auth";
import { requestTime } from "@/server/clock";
import { createClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Diseño de la carta" };

type Props = PageProps<"/panel/[negocio]/diseno">;

export default function DesignPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <Design params={props.params} />
    </Suspense>
  );
}

/** Carta de ejemplo para la vista previa cuando el local todavía no cargó productos. */
function sampleSnapshot(currency: string): MenuSnapshot {
  const product = (id: string, name: string, description: string, price: number) => ({
    id,
    name,
    description,
    price_minor: price,
    status: "available" as const,
    tags: [],
    image: null,
    variants: [],
    extras: [],
  });
  return {
    v: 1,
    menu: { id: "ejemplo", name: "Carta", description: "", kind: "regular" },
    currency,
    categories: [
      {
        id: "ejemplo-entradas",
        name: "Entradas",
        description: "",
        products: [
          product("e1", "Empanadas de carne cortada a cuchillo", "Horneadas, la unidad.", 250000),
          product("e2", "Provoleta", "Con orégano y aceite de oliva.", 900000),
        ],
      },
      {
        id: "ejemplo-principales",
        name: "Principales",
        description: "",
        products: [
          product("p1", "Milanesa napolitana", "Con papas fritas.", 1450000),
          product("p2", "Ravioles de ricota", "Con salsa a elección.", 1200000),
        ],
      },
    ],
  };
}

async function Design({ params }: { params: Props["params"] }) {
  const { negocio } = await params;
  const ctx = await getBusinessContext(negocio);
  const base = `/panel/${ctx.business.slug}`;
  if (!ctx.permissions["business.update"]) return <RestrictedState backHref={base} />;

  const supabase = await createClient();
  const branch = ctx.activeBranch ?? ctx.branches[0] ?? null;
  const [{ data: business }, { data: request }, { data: lastImport }, { data: menuLink }, ai] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id, name, description, brand_color, theme, website_url, currency, locale, logo:media!businesses_logo_fk(path_sm, path_lg, width, height), cover:media!businesses_cover_fk(path_sm, path_lg, width, height)",
      )
      .eq("id", ctx.business.id)
      .single(),
    supabase
      .from("design_requests")
      .select("id, status, theme, summary, sources, provider, error_message, created_at, origin")
      .eq("business_id", ctx.business.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("imports").select("id").eq("business_id", ctx.business.id).in("status", ["needs_review", "completed"]).limit(1).maybeSingle(),
    branch
      ? supabase.from("menu_branches").select("menu_id, menus!inner(status)").eq("branch_id", branch.id).eq("menus.status", "active").order("sort_order").limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    getAiAvailability(),
  ]);
  if (!business) return <RestrictedState backHref={base} />;

  const [{ data: snapshot }, { data: branchRow }] = await Promise.all([
    menuLink && branch ? supabase.rpc("get_draft_snapshot", { p_menu_id: menuLink.menu_id, p_branch_id: branch.id }) : Promise.resolve({ data: null }),
    branch ? supabase.from("branches").select("*").eq("id", branch.id).single() : Promise.resolve({ data: null }),
  ]);
  const parsedSnapshot = snapshot ? parseSnapshot(snapshot) : null;
  const hasProducts = Boolean(parsedSnapshot?.categories.some((c) => c.products.length));

  const toMedia = (m: unknown) => {
    const media = m as { path_sm: string; path_lg: string; width: number; height: number } | null;
    return media ? { sm: media.path_sm, lg: media.path_lg, w: media.width, h: media.height } : null;
  };
  const preview: PublicMenuData = {
    business: {
      id: business.id,
      name: business.name,
      description: business.description,
      brand_color: business.brand_color,
      theme: null,
      currency: business.currency,
      locale: business.locale,
      logo: toMedia(business.logo),
      cover: toMedia(business.cover),
    },
    branch: {
      id: branchRow?.id ?? "ejemplo",
      name: branchRow?.name ?? "Sucursal",
      public_slug: branchRow?.public_slug ?? "ejemplo",
      address: branchRow?.address ?? "",
      phone: branchRow?.phone ?? "",
      whatsapp: branchRow?.whatsapp ?? "",
      public_note: branchRow?.public_note ?? "",
      timezone: branchRow?.timezone ?? "America/Argentina/Buenos_Aires",
      opening_hours: (branchRow?.opening_hours as unknown as OpeningInterval[]) ?? [],
      other_branches: [],
    },
    menus: [
      {
        menu_id: parsedSnapshot?.menu.id ?? "ejemplo",
        kind: "regular",
        version_number: null,
        published_at: null,
        snapshot: hasProducts && parsedSnapshot ? parsedSnapshot : sampleSnapshot(business.currency),
      },
    ],
    promotions: [],
  };

  const requestView: DesignRequestView | null = request
    ? {
        id: request.id,
        status: request.status as DesignRequestView["status"],
        theme: parseTheme(request.theme),
        summary: request.summary,
        sources: request.sources.filter((s): s is DesignSource => (DESIGN_SOURCES as readonly string[]).includes(s)),
        simulated: request.provider === "mock",
        errorMessage: request.error_message,
        origin: request.origin as "manual" | "import",
      }
    : null;

  return (
    <>
      <PageHeader
        title="Diseño de la carta"
        description="Colores, tipografías y estilo de tu carta pública. Te proponemos uno a medida a partir de la identidad de tu local, y lo podés ajustar a mano."
      />
      <DesignStudio
        // Cuando cambia la propuesta (lista, aplicada…) el estudio arranca de nuevo con los datos actuales.
        key={`${request?.id ?? "sin-propuesta"}:${request?.status ?? ""}`}
        businessId={business.id}
        readOnly={ctx.suspended}
        savedTheme={parseTheme(business.theme)}
        brandColor={business.brand_color}
        websiteUrl={business.website_url ?? ""}
        references={{ logo: Boolean(business.logo), cover: Boolean(business.cover), menuPhoto: Boolean(lastImport) }}
        links={{ settings: `${base}/configuracion`, importPhoto: `${base}/actualizar`, publicMenu: branchRow ? `/m/${branchRow.public_slug}` : null }}
        request={requestView}
        aiAvailable={ai.available}
        preview={preview}
        previewIsSample={!hasProducts}
        serverNow={await requestTime()}
      />
    </>
  );
}
