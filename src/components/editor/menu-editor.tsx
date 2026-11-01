"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EllipsisVertical,
  FolderPlus,
  Info,
  MapPin,
  PencilLine,
  Percent,
  Plus,
  Search,
  Send,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { ActionError } from "@/components/app/form";
import { PublishStateBadge } from "@/components/app/status";
import { EmptyState } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";
import { nameKey } from "@/domain/text";
import type { ProductStatus } from "@/domain/snapshot";
import { useAction } from "@/hooks/use-action";
import {
  archiveProductAction,
  duplicateProductAction,
  reorderCategoriesAction,
  reorderProductsAction,
  setProductStatusAction,
} from "@/server/actions/catalog";
import type { MenuEditorData } from "@/server/queries/menus";
import { BranchPricesDialog } from "./branch-prices-dialog";
import { CategoryDialog, DeleteCategoryDialog } from "./category-dialogs";
import { MenuSettingsDialog } from "./menu-settings-dialog";
import { ProductRow } from "./product-row";
import { ProductSheet } from "./product-sheet";
import { PublishDialog } from "./publish-dialog";
import type { EditorCategory, EditorEnv, EditorProduct, StatusFilter } from "./types";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos (sin archivados)" },
  { value: "available", label: "Disponibles" },
  { value: "sold_out", label: "Agotados" },
  { value: "hidden", label: "Ocultos" },
  { value: "archived", label: "Archivados" },
];

export function MenuEditor({
  data,
  env,
  appUrl,
  branchSlugs,
  allBranches,
}: {
  data: MenuEditorData;
  env: EditorEnv;
  appUrl: string;
  branchSlugs: Record<string, string>;
  allBranches: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sheet, setSheet] = useState<{ product: EditorProduct | null; categoryId: string } | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ category: EditorCategory | null } | null>(null);
  const [deleting, setDeleting] = useState<EditorCategory | null>(null);
  const [branchPrices, setBranchPrices] = useState<EditorProduct | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const statusAction = useAction(setProductStatusAction);
  const duplicateAction = useAction(duplicateProductAction);
  const archiveAction = useAction(archiveProductAction);
  const reorderProducts = useAction(reorderProductsAction);
  const reorderCategories = useAction(reorderCategoriesAction);
  const rowError = statusAction.error ?? duplicateAction.error ?? archiveAction.error ?? reorderProducts.error ?? reorderCategories.error;

  const editable = env.canEditContent && !env.readOnly;
  const q = nameKey(query);
  const productsByCategory = useMemo(() => {
    const map = new Map<string, EditorProduct[]>();
    for (const product of data.products) {
      const archived = Boolean(product.archived_at);
      if (filter === "archived" ? !archived : archived) continue;
      if (filter !== "all" && filter !== "archived" && product.status !== filter) continue;
      if (q && !nameKey(`${product.name} ${product.description}`).includes(q)) continue;
      map.set(product.category_id, [...(map.get(product.category_id) ?? []), product]);
    }
    return map;
  }, [data.products, filter, q]);

  const activeCount = data.products.filter((p) => !p.archived_at).length;
  const anyMatches = [...productsByCategory.values()].some((list) => list.length > 0);
  const hasChanges = data.publishStatus.some((s) => s.has_changes);
  const accessibleBranchIds = data.menuBranches.filter((b) => b.accessible).map((b) => b.id);
  const defaultCategory = data.categories[0]?.id ?? "";

  async function run<T>(id: string, fn: () => Promise<T>) {
    setBusyId(id);
    try {
      return await fn();
    } finally {
      setBusyId(null);
    }
  }

  function moveProduct(categoryId: string, productId: string, delta: number) {
    const ids = data.products
      .filter((p) => p.category_id === categoryId && !p.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es"))
      .map((p) => p.id);
    const index = ids.indexOf(productId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(productId, () => reorderProducts.run(categoryId, ids));
  }

  function moveCategory(categoryId: string, delta: number) {
    const ids = data.categories.map((c) => c.id);
    const index = ids.indexOf(categoryId);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(categoryId, () => reorderCategories.run(env.menuId, ids));
  }

  return (
    <div className="grid gap-6">
      {/* Encabezado */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link href={`${env.base}/menus`} className="-ml-1 inline-flex min-h-11 items-center rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            ← Menús
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{data.menu.name}</h1>
            {data.menu.status === "archived" && <Badge variant="muted">Archivada</Badge>}
          </div>
          {data.menu.description && <p className="mt-1 text-sm text-muted-foreground">{data.menu.description}</p>}
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Estado de publicación por sucursal">
            {data.publishStatus.map((s) => (
              <li key={s.branch_id} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm">
                <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{s.branch_name}</span>
                <PublishStateBadge state={!s.published_version_id ? "unpublished" : s.has_changes ? "changes" : "published"} />
              </li>
            ))}
            {data.menuBranches.length === 0 && <Badge variant="warning">Sin sucursal: no se muestra en ninguna carta pública</Badge>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.menuBranches.length > 0 && (
            <Button asChild variant="outline">
              <Link href={`${env.base}/menus/${env.menuId}/vista-previa`}>
                <Eye aria-hidden="true" /> Vista previa
              </Link>
            </Button>
          )}
          {data.menu.status === "active" && !env.readOnly && accessibleBranchIds.length > 0 && data.products.length > 0 && (
            <Button asChild variant="outline">
              <Link href={`${env.base}/menus/${env.menuId}/precios`}>
                <Percent aria-hidden="true" /> Precios masivos
              </Link>
            </Button>
          )}
          {env.canPublish && data.menu.status === "active" && accessibleBranchIds.length > 0 && (
            <Button onClick={() => setPublishing(true)} variant={hasChanges ? "default" : "outline"} disabled={env.readOnly}>
              <Send aria-hidden="true" /> Publicar
            </Button>
          )}
          {(env.canManage || editable) && (
            <Button variant="outline" size="icon" aria-label="Configurar la carta" onClick={() => setSettings(true)} disabled={env.readOnly}>
              <EllipsisVertical aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

      {data.menuBranches.length > 1 && (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            Esta carta se usa en {data.menuBranches.map((b) => b.name).join(" y ")}. Nombres, descripciones y estructura se comparten; los precios y la
            disponibilidad pueden ser propios de cada sucursal desde «Precios por sucursal».
          </AlertDescription>
        </Alert>
      )}
      {!env.canEditContent && !env.readOnly && (
        <Alert variant="warning">
          <Info aria-hidden="true" />
          <AlertDescription>
            No tenés acceso a todas las sucursales de esta carta: podés cambiar precios y disponibilidad de tus sucursales, pero no el contenido compartido.
          </AlertDescription>
        </Alert>
      )}
      {!env.canPublish && !env.readOnly && (
        <p className="text-sm text-muted-foreground">Tus cambios quedan en el borrador. Para publicarlos, avisale a alguien con permiso de publicación.</p>
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-1.5">
          <label htmlFor="buscar-productos" className="text-sm font-semibold">
            Buscar productos
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="buscar-productos" type="search" className="pl-9" placeholder="Nombre o descripción" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5 sm:w-60">
          <label htmlFor="filtro-estado" className="text-sm font-semibold">
            Mostrar
          </label>
          <NativeSelect id="filtro-estado" value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {editable && (
          <Button variant="outline" onClick={() => setCategoryDialog({ category: null })}>
            <FolderPlus aria-hidden="true" /> Categoría
          </Button>
        )}
      </div>

      <ActionError error={rowError} />

      {/* Contenido */}
      {data.categories.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Tu carta está vacía"
          description="Empezá creando una categoría, por ejemplo «Entradas». Después agregás los productos."
        >
          {editable && (
            <Button onClick={() => setCategoryDialog({ category: null })}>
              <FolderPlus aria-hidden="true" /> Crear la primera categoría
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`${env.base}/actualizar`}>Cargarla con fotos</Link>
          </Button>
        </EmptyState>
      ) : (q || filter !== "all") && !anyMatches ? (
        <p role="status" className="rounded-xl border border-dashed border-[#cdd3c9] bg-card p-6 text-center text-sm text-muted-foreground">
          {q ? `No hay productos que coincidan con «${query}».` : "No hay productos con ese estado."} Probá con otra búsqueda o filtro.
        </p>
      ) : (
        <div className="grid gap-5">
          {data.categories.map((category, catIndex) => {
            const products = (productsByCategory.get(category.id) ?? []).sort(
              (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "es"),
            );
            if ((q || filter !== "all") && products.length === 0) return null;
            const totalInCategory = data.products.filter((p) => p.category_id === category.id).length;
            return (
              <section key={category.id} aria-labelledby={`cat-${category.id}`} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-[#fbfaf6] px-3 py-2 sm:px-4">
                  <div className="min-w-0">
                    <h2 id={`cat-${category.id}`} className="truncate text-base font-bold">
                      {category.name}
                    </h2>
                    <p className="text-[13px] text-muted-foreground">
                      {products.length} {products.length === 1 ? "producto" : "productos"}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSheet({ product: null, categoryId: category.id })}>
                        <Plus aria-hidden="true" /> Producto
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Acciones de la categoría ${category.name}`} disabled={busyId === category.id}>
                            <EllipsisVertical aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setCategoryDialog({ category })}>
                            <PencilLine aria-hidden="true" /> Renombrar
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={catIndex === 0} onSelect={() => moveCategory(category.id, -1)}>
                            <ArrowUp aria-hidden="true" /> Subir categoría
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={catIndex === data.categories.length - 1} onSelect={() => moveCategory(category.id, 1)}>
                            <ArrowDown aria-hidden="true" /> Bajar categoría
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(category)}>
                            <Trash2 aria-hidden="true" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                {products.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-muted-foreground">
                    {totalInCategory === 0 ? "Todavía no hay productos en esta categoría." : "No hay productos visibles con este filtro."}{" "}
                    {editable && totalInCategory === 0 && (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
                        onClick={() => setSheet({ product: null, categoryId: category.id })}
                      >
                        Agregar el primero
                      </button>
                    )}
                  </div>
                ) : (
                  <ul>
                    {products.map((product, index) => (
                      <ProductRow
                        key={product.id}
                        env={env}
                        product={product}
                        index={index}
                        count={products.length}
                        busy={busyId === product.id}
                        onEdit={() => setSheet({ product, categoryId: product.category_id })}
                        onStatus={(status: ProductStatus) => void run(product.id, () => statusAction.run(product.id, status))}
                        onDuplicate={() => void run(product.id, () => duplicateAction.run(product.id))}
                        onArchive={(archived) => void run(product.id, () => archiveAction.run(product.id, archived))}
                        onMove={(delta) => moveProduct(category.id, product.id, delta)}
                        onBranchPrices={() => setBranchPrices(product)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editable && data.categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSheet({ product: null, categoryId: defaultCategory })}>
            <Plus aria-hidden="true" /> Agregar producto
          </Button>
          <p className="self-center text-sm text-muted-foreground">
            {activeCount} {activeCount === 1 ? "producto" : "productos"} en el borrador
          </p>
        </div>
      )}

      {sheet && (
        <ProductSheet
          key={sheet.product?.id ?? `new-${sheet.categoryId}`}
          env={env}
          product={sheet.product}
          defaultCategoryId={sheet.categoryId}
          categories={data.categories}
          onClose={() => setSheet(null)}
        />
      )}
      {categoryDialog && <CategoryDialog menuId={env.menuId} category={categoryDialog.category} onClose={() => setCategoryDialog(null)} />}
      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          productCount={data.products.filter((p) => p.category_id === deleting.id).length}
          others={data.categories.filter((c) => c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
      {branchPrices && <BranchPricesDialog env={env} product={branchPrices} onClose={() => setBranchPrices(null)} />}
      {publishing && (
        <PublishDialog
          menuId={env.menuId}
          menuName={data.menu.name}
          base={env.base}
          appUrl={appUrl}
          branchSlugs={branchSlugs}
          accessibleBranchIds={accessibleBranchIds}
          onClose={() => setPublishing(false)}
        />
      )}
      {settings && (
        <MenuSettingsDialog
          env={env}
          menu={data.menu}
          menuBranchIds={data.menuBranches.map((b) => b.id)}
          allBranches={allBranches}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
