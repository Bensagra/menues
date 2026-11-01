import { MAX_MINOR, applyPercent, isCurrencyCode, roundToStep, type CurrencyCode, type RoundingMode } from "./money";

// Precios masivos. El cálculo es puro y se usa igual en la vista previa y al
// aplicar: el servidor lo recalcula con los datos actuales y la base vuelve a
// verificar cada precio dentro de una transacción.

export interface BulkPriceRule {
  change: { type: "percent"; basisPoints: number } | { type: "amount"; minor: number };
  rounding: { step: number; mode: RoundingMode };
  /** "base": precio general de la carta (todas sus sucursales). "branch": precio propio de una sucursal. */
  target: { type: "base" } | { type: "branch"; branchId: string };
  /** null = toda la carta */
  categoryIds: string[] | null;
}

export interface PricedItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  categoryId: string;
  categoryName: string;
  basePrice: number | null;
  /** Solo las sucursales con precio propio */
  branchPrices: { branchId: string; price: number }[];
}

export type PriceChangeTarget = "product" | "variant" | "product_branch" | "variant_branch";

export interface PriceChange {
  target: PriceChangeTarget;
  productId: string;
  variantId: string | null;
  branchId: string | null;
  productName: string;
  variantName: string | null;
  categoryName: string;
  /** Valor guardado hoy en el destino; null si la sucursal todavía no tiene precio propio. */
  storedFrom: number | null;
  /** Precio general actual (valida los cambios por sucursal que parten de él). */
  baseFrom: number | null;
  /** Precio que se muestra hoy en ese destino. */
  from: number;
  to: number;
  /** Sucursales con precio propio que no cambian (solo con destino "base"). */
  keepsOwnPrice: string[];
}

export const MAX_PERCENT_BASIS_POINTS = 50_000; // +500 %
export const MIN_PERCENT_BASIS_POINTS = -9_000; // -90 %

export function newPrice(price: number, rule: Pick<BulkPriceRule, "change" | "rounding">): number {
  const changed = rule.change.type === "percent" ? applyPercent(price, rule.change.basisPoints) : Math.max(0, price + rule.change.minor);
  return Math.min(MAX_MINOR, Math.max(0, roundToStep(changed, rule.rounding.step, rule.rounding.mode)));
}

export function computeBulkPriceChanges(items: PricedItem[], rule: BulkPriceRule): PriceChange[] {
  const categories = rule.categoryIds ? new Set(rule.categoryIds) : null;
  const changes: PriceChange[] = [];
  for (const item of items) {
    if (categories && !categories.has(item.categoryId)) continue;
    const common = {
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      categoryName: item.categoryName,
    };
    if (rule.target.type === "base") {
      if (item.basePrice === null) continue;
      const to = newPrice(item.basePrice, rule);
      if (to === item.basePrice) continue;
      changes.push({
        ...common,
        target: item.variantId ? "variant" : "product",
        branchId: null,
        storedFrom: item.basePrice,
        baseFrom: item.basePrice,
        from: item.basePrice,
        to,
        keepsOwnPrice: item.branchPrices.map((b) => b.branchId),
      });
    } else {
      const branchId = rule.target.branchId;
      const own = item.branchPrices.find((b) => b.branchId === branchId);
      const effective = own?.price ?? item.basePrice;
      if (effective === null) continue;
      const to = newPrice(effective, rule);
      if (to === effective) continue;
      changes.push({
        ...common,
        target: item.variantId ? "variant_branch" : "product_branch",
        branchId,
        storedFrom: own?.price ?? null,
        baseFrom: item.basePrice,
        from: effective,
        to,
        keepsOwnPrice: [],
      });
    }
  }
  return changes;
}

/** Huella estable de una vista previa: si cambia, alguien modificó precios en el medio. */
export function changesFingerprint(changes: PriceChange[]): string {
  return changes
    .map((c) => [c.target, c.variantId ?? c.productId, c.branchId ?? "-", c.storedFrom ?? "n", c.baseFrom ?? "n", c.to].join(":"))
    .sort()
    .join("|");
}

/**
 * Opciones de redondeo por moneda, en unidades menores: pasos que se usan en
 * cartas reales (en ARS nadie redondea a centavos; en USD sí a 0,05).
 */
const ROUNDING_STEPS: Record<CurrencyCode, number[]> = {
  ARS: [1_000, 5_000, 10_000, 50_000, 100_000], // $10 · $50 · $100 · $500 · $1.000
  UYU: [100, 500, 1_000, 5_000, 10_000],
  COP: [10_000, 50_000, 100_000, 500_000],
  MXN: [100, 500, 1_000, 5_000],
  BRL: [10, 50, 100, 500],
  PEN: [10, 50, 100, 500],
  BOB: [50, 100, 500, 1_000],
  USD: [5, 10, 50, 100],
  EUR: [5, 10, 50, 100],
  CLP: [10, 50, 100, 500, 1_000],
  PYG: [100, 500, 1_000, 5_000],
};

export function roundingSteps(currency: string): number[] {
  return isCurrencyCode(currency) ? ROUNDING_STEPS[currency] : [];
}
