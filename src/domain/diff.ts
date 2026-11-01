import type { MergedExtraction, MergedItem } from "./extraction";
import { resolvePrice, type ResolvedPrice } from "./printed-price";
import { cleanText, looseKey, nameKey, similarity } from "./text";

// Motor de comparación: transforma la extracción en propuestas de cambio sobre
// el catálogo existente. Reglas:
//   * Nunca propone borrar productos que no aparecen en la foto.
//   * Nunca convierte un precio ilegible o ausente en cero, ni pisa un campo
//     existente con uno ausente.
//   * "Solo precios" solo genera cambios de precio.
//   * Coincidencias por similitud nunca renombran solas: requieren revisión.
//   * Ítems repetidos (misma foto o páginas superpuestas) se fusionan.

export type ProposalKind =
  | "new_category"
  | "new_product"
  | "price_change"
  | "name_change"
  | "description_change"
  | "variant_change"
  | "possible_duplicate"
  | "uncertain_match"
  | "illegible"
  | "no_change"
  | "not_found";

export type ImportScope = "full" | "categories" | "prices_only";

export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogVariant {
  id: string;
  name: string;
  priceMinor: number | null;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  /** Precio vigente para las sucursales de la importación. */
  priceMinor: number | null;
  revision: number;
  variants: CatalogVariant[];
}

export interface DiffInput {
  extraction: MergedExtraction;
  catalog: { categories: CatalogCategory[]; products: CatalogProduct[] };
  scope: ImportScope;
  scopeCategoryIds: string[];
  currency: string;
  /** Si los precios van al precio base (la importación cubre todas las sucursales del menú). */
  baseScope: boolean;
  /** Si quien importa puede cambiar el contenido compartido del menú. */
  coversMenu: boolean;
}

export interface ProposalDraft {
  position: number;
  kind: ProposalKind;
  status: "pending" | "skipped";
  needs_review: boolean;
  applicable: boolean;
  product_id: string | null;
  category_id: string | null;
  new_category_ref: string | null;
  base_revision: number | null;
  page_number: number | null;
  current_value: Record<string, unknown> | null;
  detected_value: Record<string, unknown>;
  proposed_value: Record<string, unknown> | null;
  flags: string[];
  reason: string;
}

export interface DiffSummary {
  price_changes: number;
  new_products: number;
  new_categories: number;
  details_changes: number;
  needs_review: number;
  no_change: number;
  not_found: number;
  out_of_scope: number;
  unreadable_pages: number;
  total_items: number;
}

const CURRENCY_SYMBOLS: Record<string, string[]> = {
  ARS: ["$", "ars", "$ars", "ar$"],
  USD: ["us$", "u$s", "usd", "u$d", "$"],
  EUR: ["€", "eur"],
  UYU: ["$", "uyu", "$u"],
  BRL: ["r$", "brl"],
  MXN: ["$", "mxn"],
  CLP: ["$", "clp"],
  PEN: ["s/", "s/.", "pen"],
  COP: ["$", "cop"],
  PYG: ["gs", "₲", "pyg"],
  BOB: ["bs", "bs.", "bob"],
};

export function currencyMatches(printed: string | null, currency: string): boolean {
  if (!printed) return true;
  const normalized = printed.toLowerCase().replace(/\s/g, "");
  return (CURRENCY_SYMBOLS[currency] ?? []).includes(normalized);
}

interface PreparedItem {
  item: MergedItem;
  key: string;
  categoryKey: string;
  price: ResolvedPrice;
  variants: { name: string; key: string; price: ResolvedPrice }[];
  duplicates: MergedItem[];
  conflicting: boolean;
}

function prepareItems(items: MergedItem[], currency: string): { prepared: PreparedItem[]; unnamed: MergedItem[] } {
  const byKey = new Map<string, PreparedItem>();
  const unnamed: MergedItem[] = [];
  for (const item of items) {
    if (!item.name || item.illegible_fields.includes("name")) {
      unnamed.push(item);
      continue;
    }
    const categoryKey = looseKey(item.categoryName);
    const key = `${categoryKey}|${nameKey(item.name)}`;
    const price = resolvePrice(item.price_text, item.price_value, currency, item.illegible_fields.includes("price"));
    const variants = item.variants
      .filter((v) => v.name)
      .map((v) => ({
        name: v.name as string,
        key: nameKey(v.name),
        price: resolvePrice(v.price_text, v.price_value, currency, item.illegible_fields.includes("variants")),
      }));
    const existing = byKey.get(key);
    if (existing) {
      existing.duplicates.push(item);
      const samePrice = JSON.stringify(existing.price) === JSON.stringify(price);
      const sameVariants = JSON.stringify(existing.variants.map((v) => v.price)) === JSON.stringify(variants.map((v) => v.price));
      if (!samePrice || !sameVariants) existing.conflicting = true;
      if (!existing.item.description && item.description) existing.item = { ...existing.item, description: item.description };
      continue;
    }
    byKey.set(key, { item, key, categoryKey, price, variants, duplicates: [], conflicting: false });
  }
  return { prepared: [...byKey.values()], unnamed };
}

function priceDetected(price: ResolvedPrice): number | null {
  if (price.status === "ok") return price.minor;
  if (price.status === "review") return price.minor;
  return null;
}

function priceFlags(price: ResolvedPrice): string[] {
  if (price.status === "review") return [`price_${price.reason}`];
  if (price.status === "illegible") return ["price_illegible"];
  return [];
}

function isLargeChange(before: number | null, after: number): boolean {
  if (before === null || before === 0) return false;
  return after > before * 2 || after * 2 < before;
}

function detectedSnapshot(entry: PreparedItem) {
  return {
    name: entry.item.name,
    description: entry.item.description,
    category: entry.item.categoryName,
    price_text: entry.item.price_text,
    price_value: entry.item.price_value,
    price_candidates: entry.price.status === "review" ? entry.price.candidates : undefined,
    variants: entry.item.variants.map((v) => ({ name: v.name, price_text: v.price_text })),
    illegible_fields: entry.item.illegible_fields,
    pages: [entry.item.page, ...entry.duplicates.map((d) => d.page)],
  };
}

function productCurrent(product: CatalogProduct, categories: Map<string, CatalogCategory>) {
  return {
    name: product.name,
    description: product.description,
    price_minor: product.priceMinor,
    category: categories.get(product.categoryId)?.name ?? null,
    variants: product.variants.map((v) => ({ variant_id: v.id, name: v.name, price_minor: v.priceMinor })),
  };
}

export function buildProposals(input: DiffInput): { proposals: ProposalDraft[]; summary: DiffSummary } {
  const { extraction, catalog, scope, currency } = input;
  const pricesOnly = scope === "prices_only";
  const categoriesById = new Map(catalog.categories.map((c) => [c.id, c]));
  const categoryByLoose = new Map(catalog.categories.map((c) => [looseKey(c.name), c]));
  const productsByKey = new Map<string, CatalogProduct[]>();
  const productsByLoose = new Map<string, CatalogProduct[]>();
  for (const product of catalog.products) {
    const k = nameKey(product.name);
    const lk = looseKey(product.name);
    productsByKey.set(k, [...(productsByKey.get(k) ?? []), product]);
    productsByLoose.set(lk, [...(productsByLoose.get(lk) ?? []), product]);
  }

  const currencyMismatch = extraction.pages.some((p) => p.currencyText && !currencyMatches(p.currencyText, currency));
  const proposals: ProposalDraft[] = [];
  const summary: DiffSummary = {
    price_changes: 0,
    new_products: 0,
    new_categories: 0,
    details_changes: 0,
    needs_review: 0,
    no_change: 0,
    not_found: 0,
    out_of_scope: 0,
    unreadable_pages: extraction.pages.filter((p) => !p.readable).length,
    total_items: extraction.items.length,
  };
  const newCategoryRefs = new Map<string, string>();
  const sharedFlag = input.baseScope ? [] : ["branch_specific_price"];
  const sharedContentFlag = input.baseScope ? [] : ["affects_other_branches"];

  const push = (proposal: Omit<ProposalDraft, "position">) => {
    const flags = [...new Set([...(currencyMismatch && /price|variant|new_product|illegible|uncertain|duplicate/.test(proposal.kind) ? ["currency_mismatch"] : []), ...proposal.flags])];
    const needsReview = proposal.needs_review || flags.includes("currency_mismatch");
    proposals.push({ ...proposal, flags, needs_review: needsReview, position: proposals.length });
  };

  const inScopeCategory = (categoryId: string | null) =>
    scope !== "categories" || (categoryId !== null && input.scopeCategoryIds.includes(categoryId));

  const { prepared, unnamed } = prepareItems(extraction.items, currency);

  for (const entry of prepared) {
    const { item } = entry;
    const matchedCategory = item.categoryName ? categoryByLoose.get(entry.categoryKey) ?? null : null;
    const detected = detectedSnapshot(entry);
    const duplicateFlags = entry.duplicates.length ? ["repeated_in_photos"] : [];
    const conflictFlags = entry.conflicting ? ["conflicting_values"] : [];

    // 1) Coincidencia exacta (misma clave normalizada) o laxa (plural, palabras vacías).
    let candidates = productsByKey.get(nameKey(item.name)) ?? productsByLoose.get(looseKey(item.name)) ?? [];
    if (candidates.length > 1 && matchedCategory) {
      const sameCategory = candidates.filter((p) => p.categoryId === matchedCategory.id);
      if (sameCategory.length === 1) candidates = sameCategory;
    }

    if (candidates.length === 1) {
      const product = candidates[0];
      if (!inScopeCategory(product.categoryId)) {
        summary.out_of_scope++;
        continue;
      }
      const current = productCurrent(product, categoriesById);
      let changed = false;

      // Precio
      const hasCatalogVariants = product.variants.length > 0;
      if (entry.variants.length === 0 && entry.price.status !== "absent") {
        if (hasCatalogVariants) {
          changed = true;
          push({
            kind: "variant_change",
            status: "pending",
            needs_review: true,
            applicable: true,
            product_id: product.id,
            category_id: product.categoryId,
            new_category_ref: null,
            base_revision: product.revision,
            page_number: item.page,
            current_value: current,
            detected_value: detected,
            proposed_value: null,
            flags: ["variant_structure", ...priceFlags(entry.price), ...duplicateFlags, ...conflictFlags, ...sharedFlag],
            reason: "La foto muestra un solo precio y en tu carta este producto tiene variantes. Indicá el precio de cada variante.",
          });
        } else if (entry.price.status === "illegible") {
          changed = true;
          push({
            kind: "illegible",
            status: "pending",
            needs_review: true,
            applicable: true,
            product_id: product.id,
            category_id: product.categoryId,
            new_category_ref: null,
            base_revision: product.revision,
            page_number: item.page,
            current_value: current,
            detected_value: detected,
            proposed_value: null,
            flags: ["price_illegible", ...duplicateFlags, ...sharedFlag],
            reason: "El precio no se pudo leer en la foto. Escribilo o descartá el cambio; no se modifica nada si lo descartás.",
          });
        } else {
          const detectedMinor = priceDetected(entry.price);
          const review = entry.price.status === "review" || entry.conflicting;
          if (detectedMinor !== null && detectedMinor === product.priceMinor && !review) {
            // sin cambios de precio
          } else {
            changed = true;
            const large = detectedMinor !== null && isLargeChange(product.priceMinor, detectedMinor);
            push({
              kind: "price_change",
              status: "pending",
              needs_review: review || large,
              applicable: true,
              product_id: product.id,
              category_id: product.categoryId,
              new_category_ref: null,
              base_revision: product.revision,
              page_number: item.page,
              current_value: current,
              detected_value: detected,
              proposed_value: detectedMinor !== null ? { price_minor: detectedMinor } : null,
              flags: [...priceFlags(entry.price), ...(large ? ["large_change"] : []), ...duplicateFlags, ...conflictFlags, ...sharedFlag],
              reason: review
                ? entry.conflicting
                  ? "El producto aparece más de una vez con precios distintos. Confirmá cuál es el correcto."
                  : "El precio impreso admite más de una lectura. Confirmá el valor correcto."
                : large
                  ? "El precio cambia mucho respecto del actual. Revisá que esté bien leído."
                  : "Precio distinto al de tu carta.",
            });
          }
        }
      }

      // Variantes
      if (entry.variants.length > 0) {
        const changes: { variant_id: string | null; name: string; price_minor: number | null }[] = [];
        const flags = new Set<string>([...duplicateFlags, ...conflictFlags, ...sharedFlag]);
        let review = entry.conflicting;
        for (const variant of entry.variants) {
          const existing =
            product.variants.find((v) => nameKey(v.name) === variant.key) ??
            product.variants.find((v) => looseKey(v.name) === looseKey(variant.name));
          const minor = priceDetected(variant.price);
          if (variant.price.status === "review" || variant.price.status === "illegible") {
            review = true;
            priceFlags(variant.price).forEach((f) => flags.add(f));
          }
          if (existing) {
            if (variant.price.status === "absent") continue;
            if (minor !== null && minor === existing.priceMinor && variant.price.status === "ok") continue;
            changes.push({ variant_id: existing.id, name: existing.name, price_minor: minor });
          } else if (!pricesOnly) {
            flags.add(hasCatalogVariants ? "new_variant" : "adds_variants");
            review = review || !hasCatalogVariants;
            changes.push({ variant_id: null, name: variant.name, price_minor: minor });
          } else {
            flags.add("new_variant_ignored");
          }
        }
        if (changes.length > 0) {
          changed = true;
          const missingPrice = changes.some((c) => c.price_minor === null);
          push({
            kind: "variant_change",
            status: "pending",
            needs_review: review || missingPrice,
            applicable: true,
            product_id: product.id,
            category_id: product.categoryId,
            new_category_ref: null,
            base_revision: product.revision,
            page_number: item.page,
            current_value: current,
            detected_value: detected,
            proposed_value: missingPrice ? null : { variants: changes },
            flags: [...flags],
            reason: review || missingPrice ? "Revisá los precios de las variantes detectadas." : "Precios de variantes distintos a los de tu carta.",
          });
        } else if (flags.has("new_variant_ignored")) {
          // nada que aplicar
        }
      }

      // Descripción (solo si la foto la trae y difiere; nunca se borra una existente)
      if (!pricesOnly && item.description && nameKey(item.description) !== nameKey(product.description)) {
        changed = true;
        push({
          kind: "description_change",
          status: "pending",
          needs_review: false,
          applicable: input.coversMenu,
          product_id: product.id,
          category_id: product.categoryId,
          new_category_ref: null,
          base_revision: product.revision,
          page_number: item.page,
          current_value: current,
          detected_value: detected,
          proposed_value: { description: cleanText(item.description, 600) },
          flags: [...sharedContentFlag, ...duplicateFlags],
          reason: product.description ? "La descripción impresa es distinta." : "La foto incluye una descripción que tu carta no tiene.",
        });
      }

      if (!changed) {
        summary.no_change++;
        push({
          kind: "no_change",
          status: "skipped",
          needs_review: false,
          applicable: false,
          product_id: product.id,
          category_id: product.categoryId,
          new_category_ref: null,
          base_revision: product.revision,
          page_number: item.page,
          current_value: current,
          detected_value: detected,
          proposed_value: null,
          flags: duplicateFlags,
          reason: "Sin cambios.",
        });
      }
      continue;
    }

    // 2) Varias coincidencias exactas en distintas categorías → posible duplicado.
    // 3) Sin coincidencia exacta: candidatos por similitud → coincidencia dudosa.
    let kind: ProposalKind | null = null;
    let ranked: { product: CatalogProduct; score: number }[] = [];
    if (candidates.length > 1) {
      kind = "possible_duplicate";
      ranked = candidates.map((product) => ({ product, score: 1 }));
    } else {
      ranked = catalog.products
        .map((product) => ({ product, score: similarity(item.name as string, product.name) }))
        .filter((r) => r.score >= 0.72)
        .sort((a, b) => b.score - a.score);
      if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.08) kind = "possible_duplicate";
      else if (ranked.length >= 1) kind = "uncertain_match";
    }
    if (kind) {
      const best = ranked[0].product;
      if (!inScopeCategory(best.categoryId) && scope === "categories") {
        summary.out_of_scope++;
        continue;
      }
      const minor = priceDetected(entry.price);
      push({
        kind,
        status: "pending",
        needs_review: true,
        applicable: true,
        product_id: best.id,
        category_id: best.categoryId,
        new_category_ref: null,
        base_revision: best.revision,
        page_number: item.page,
        current_value: productCurrent(best, categoriesById),
        detected_value: {
          ...detected,
          candidates: ranked.slice(0, 4).map((r) => ({
            product_id: r.product.id,
            name: r.product.name,
            category: categoriesById.get(r.product.categoryId)?.name ?? null,
          })),
        },
        proposed_value: pricesOnly
          ? minor !== null ? { price_minor: minor } : null
          : {
              name: item.name,
              ...(minor !== null ? { price_minor: minor } : {}),
              ...(item.description ? { description: item.description } : {}),
              ...(entry.variants.length
                ? { variants: entry.variants.map((v) => ({ name: v.name, price_minor: priceDetected(v.price) })) }
                : {}),
            },
        flags: [...priceFlags(entry.price), ...duplicateFlags, ...conflictFlags, ...sharedFlag],
        reason:
          kind === "uncertain_match"
            ? `Se parece a «${best.name}», pero el nombre no coincide. Confirmá si es el mismo producto.`
            : `Hay más de un producto parecido en tu carta. Confirmá a cuál corresponde.`,
      });
      continue;
    }

    // 4) Producto nuevo.
    if (pricesOnly) {
      summary.not_found++;
      push({
        kind: "not_found",
        status: "skipped",
        needs_review: false,
        applicable: false,
        product_id: null,
        category_id: null,
        new_category_ref: null,
        base_revision: null,
        page_number: item.page,
        current_value: null,
        detected_value: detected,
        proposed_value: null,
        flags: [],
        reason: "No está en tu carta. Con «Solo precios» no se agregan productos.",
      });
      continue;
    }
    if (scope === "categories" && !inScopeCategory(matchedCategory?.id ?? null)) {
      summary.out_of_scope++;
      continue;
    }
    const categoryId = matchedCategory?.id ?? null;
    let categoryRef: string | null = null;
    if (!categoryId && item.categoryName && scope === "full") {
      const refKey = looseKey(item.categoryName);
      categoryRef = newCategoryRefs.get(refKey) ?? null;
      if (!categoryRef) {
        categoryRef = `nueva:${refKey}`;
        newCategoryRefs.set(refKey, categoryRef);
        summary.new_categories++;
        push({
          kind: "new_category",
          status: "pending",
          needs_review: false,
          applicable: input.coversMenu,
          product_id: null,
          category_id: null,
          new_category_ref: categoryRef,
          base_revision: null,
          page_number: item.page,
          current_value: null,
          detected_value: { name: item.categoryName },
          proposed_value: { name: item.categoryName },
          flags: sharedContentFlag,
          reason: "Sección nueva que no está en tu carta.",
        });
      }
    }
    const minor = priceDetected(entry.price);
    const priceReview = entry.price.status === "review" || entry.price.status === "illegible";
    const variantReview = entry.variants.some((v) => v.price.status !== "ok");
    const noPrice = entry.price.status === "absent" && entry.variants.length === 0;
    const needsCategory = !categoryId && !categoryRef;
    push({
      kind: "new_product",
      status: "pending",
      needs_review: priceReview || variantReview || noPrice || needsCategory || entry.conflicting,
      applicable: input.coversMenu,
      product_id: null,
      category_id: categoryId,
      new_category_ref: categoryRef,
      base_revision: null,
      page_number: item.page,
      current_value: null,
      detected_value: detected,
      proposed_value: {
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(minor !== null ? { price_minor: minor } : {}),
        ...(entry.variants.length
          ? { variants: entry.variants.map((v) => ({ name: v.name, price_minor: priceDetected(v.price) })) }
          : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(categoryRef ? { category_ref: categoryRef } : {}),
      },
      flags: [
        ...priceFlags(entry.price),
        ...(noPrice ? ["no_price"] : []),
        ...(needsCategory ? ["category_required"] : []),
        ...duplicateFlags,
        ...conflictFlags,
        ...sharedContentFlag,
      ],
      reason: needsCategory
        ? "Producto nuevo sin sección. Elegí en qué categoría va."
        : noPrice
          ? "Producto nuevo sin precio impreso. Confirmá si querés agregarlo así."
          : priceReview
            ? "Producto nuevo con un precio dudoso. Confirmá el valor."
            : "Producto nuevo.",
    });
  }

  // Ítems cuyo nombre no se pudo leer.
  for (const item of unnamed) {
    push({
      kind: "illegible",
      status: "pending",
      needs_review: true,
      applicable: !pricesOnly && input.coversMenu,
      product_id: null,
      category_id: (item.categoryName && categoryByLoose.get(looseKey(item.categoryName))?.id) || null,
      new_category_ref: null,
      base_revision: null,
      page_number: item.page,
      current_value: null,
      detected_value: {
        name: item.name,
        category: item.categoryName,
        price_text: item.price_text,
        description: item.description,
        illegible_fields: item.illegible_fields,
      },
      proposed_value: null,
      flags: ["name_illegible"],
      reason: pricesOnly
        ? "No se pudo leer el nombre de este producto. Si hace falta, actualizalo a mano."
        : "No se pudo leer el nombre. Escribilo para agregarlo o descartalo.",
    });
  }

  for (const p of proposals) {
    if (!p.applicable || p.status === "skipped") continue;
    if (p.needs_review) summary.needs_review++;
    else if (p.kind === "price_change" || p.kind === "variant_change") summary.price_changes++;
    else if (p.kind === "new_product") summary.new_products++;
    else if (p.kind === "description_change" || p.kind === "name_change") summary.details_changes++;
  }
  return { proposals, summary };
}

/** "12 cambios de precio · 3 productos nuevos · 2 por revisar" */
export function describeSummary(summary: Pick<DiffSummary, "price_changes" | "new_products" | "needs_review" | "details_changes">): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (summary.price_changes) parts.push(plural(summary.price_changes, "cambio de precio", "cambios de precio"));
  if (summary.new_products) parts.push(plural(summary.new_products, "producto nuevo", "productos nuevos"));
  if (summary.details_changes) parts.push(plural(summary.details_changes, "cambio de descripción", "cambios de descripción"));
  if (summary.needs_review) parts.push(`${summary.needs_review} por revisar`);
  return parts.length ? parts.join(" · ") : "Sin cambios";
}
