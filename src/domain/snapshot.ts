import { z } from "zod";

// Forma de la instantánea publicada (menu_versions.snapshot). La genera
// app.build_menu_snapshot() en la base; acá se valida al leerla.

export const PRODUCT_TAGS = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  sin_tacc: "Sin TACC",
  sin_lactosa: "Sin lactosa",
  picante: "Picante",
  nuevo: "Nuevo",
  recomendado: "Recomendado",
  para_compartir: "Para compartir",
} as const;

export type ProductTag = keyof typeof PRODUCT_TAGS;
export const PRODUCT_TAG_KEYS = Object.keys(PRODUCT_TAGS) as ProductTag[];

export const PRODUCT_STATUS_LABELS = {
  available: "Disponible",
  sold_out: "Agotado",
  hidden: "Oculto",
} as const;

export type ProductStatus = keyof typeof PRODUCT_STATUS_LABELS;

const imageSchema = z.object({ sm: z.string(), lg: z.string(), w: z.number(), h: z.number() });

export const snapshotProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  price_minor: z.number().int().nullable(),
  status: z.enum(["available", "sold_out"]),
  tags: z.array(z.string()).default([]),
  image: imageSchema.nullable().default(null),
  variants: z.array(z.object({ id: z.string(), name: z.string(), price_minor: z.number().int().nullable() })).default([]),
  extras: z.array(z.object({ id: z.string(), name: z.string(), price_minor: z.number().int() })).default([]),
});

export const snapshotSchema = z.object({
  v: z.literal(1),
  menu: z.object({ id: z.string(), name: z.string(), description: z.string().default(""), kind: z.string() }),
  currency: z.string(),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().default(""),
      products: z.array(snapshotProductSchema),
    }),
  ),
});

export type MenuSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotProduct = z.infer<typeof snapshotProductSchema>;
export type SnapshotImage = z.infer<typeof imageSchema>;

export function parseSnapshot(value: unknown): MenuSnapshot {
  return snapshotSchema.parse(value);
}

export function snapshotProducts(snapshot: MenuSnapshot) {
  return snapshot.categories.flatMap((category) =>
    category.products.map((product) => ({ ...product, categoryId: category.id, categoryName: category.name })),
  );
}

export interface SnapshotDiffEntry {
  productId: string;
  name: string;
  category: string;
  type: "added" | "removed" | "changed";
  changes: { field: "price" | "status" | "name" | "description" | "variants" | "extras" | "tags" | "image" | "category"; before: string; after: string }[];
}

/** Diferencias legibles entre dos versiones (para "Comparar versiones"). */
export function diffSnapshots(
  before: MenuSnapshot | null,
  after: MenuSnapshot,
  formatPrice: (minor: number | null) => string,
): SnapshotDiffEntry[] {
  const oldProducts = new Map((before ? snapshotProducts(before) : []).map((p) => [p.id, p]));
  const newProducts = new Map(snapshotProducts(after).map((p) => [p.id, p]));
  const entries: SnapshotDiffEntry[] = [];
  const statusLabel = (s: string) => PRODUCT_STATUS_LABELS[s as ProductStatus] ?? s;
  const variantsText = (vs: SnapshotProduct["variants"]) =>
    vs.map((v) => `${v.name} ${formatPrice(v.price_minor)}`.trim()).join(" · ") || "Sin variantes";
  const extrasText = (es: SnapshotProduct["extras"]) =>
    es.map((e) => `${e.name} +${formatPrice(e.price_minor)}`).join(" · ") || "Sin extras";

  for (const [id, next] of newProducts) {
    const prev = oldProducts.get(id);
    if (!prev) {
      entries.push({ productId: id, name: next.name, category: next.categoryName, type: "added", changes: [] });
      continue;
    }
    const changes: SnapshotDiffEntry["changes"] = [];
    if (prev.name !== next.name) changes.push({ field: "name", before: prev.name, after: next.name });
    if (prev.price_minor !== next.price_minor)
      changes.push({ field: "price", before: formatPrice(prev.price_minor) || "Sin precio", after: formatPrice(next.price_minor) || "Sin precio" });
    if (prev.status !== next.status) changes.push({ field: "status", before: statusLabel(prev.status), after: statusLabel(next.status) });
    if (prev.description !== next.description)
      changes.push({ field: "description", before: prev.description || "Sin descripción", after: next.description || "Sin descripción" });
    if (variantsText(prev.variants) !== variantsText(next.variants))
      changes.push({ field: "variants", before: variantsText(prev.variants), after: variantsText(next.variants) });
    if (extrasText(prev.extras) !== extrasText(next.extras))
      changes.push({ field: "extras", before: extrasText(prev.extras), after: extrasText(next.extras) });
    if (prev.tags.join(",") !== next.tags.join(","))
      changes.push({ field: "tags", before: prev.tags.join(", ") || "Sin etiquetas", after: next.tags.join(", ") || "Sin etiquetas" });
    if ((prev.image?.lg ?? null) !== (next.image?.lg ?? null))
      changes.push({ field: "image", before: prev.image ? "Con foto" : "Sin foto", after: next.image ? "Con foto" : "Sin foto" });
    if (prev.categoryId !== next.categoryId) changes.push({ field: "category", before: prev.categoryName, after: next.categoryName });
    if (changes.length) entries.push({ productId: id, name: next.name, category: next.categoryName, type: "changed", changes });
  }
  for (const [id, prev] of oldProducts) {
    if (!newProducts.has(id)) entries.push({ productId: id, name: prev.name, category: prev.categoryName, type: "removed", changes: [] });
  }
  return entries;
}
