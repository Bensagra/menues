import { describe, expect, it } from "vitest";
import { changesFingerprint, computeBulkPriceChanges, newPrice, roundingSteps, type BulkPriceRule, type PricedItem } from "@/domain/bulk-prices";

const items: PricedItem[] = [
  { productId: "p1", variantId: null, productName: "Milanesa", variantName: null, categoryId: "c1", categoryName: "Principales", basePrice: 1_250_000, branchPrices: [] },
  {
    productId: "p2",
    variantId: null,
    productName: "Bife",
    variantName: null,
    categoryId: "c1",
    categoryName: "Principales",
    basePrice: 2_000_000,
    branchPrices: [{ branchId: "belgrano", price: 2_200_000 }],
  },
  { productId: "p3", variantId: null, productName: "Pizza", variantName: null, categoryId: "c2", categoryName: "Pizzas", basePrice: null, branchPrices: [] },
  { productId: "p3", variantId: "v1", productName: "Pizza", variantName: "Chica", categoryId: "c2", categoryName: "Pizzas", basePrice: 1_000_000, branchPrices: [] },
  { productId: "p3", variantId: "v2", productName: "Pizza", variantName: "Grande", categoryId: "c2", categoryName: "Pizzas", basePrice: 1_500_000, branchPrices: [] },
];

const rule = (overrides: Partial<BulkPriceRule> = {}): BulkPriceRule => ({
  change: { type: "percent", basisPoints: 1_000 },
  rounding: { step: 10_000, mode: "nearest" },
  target: { type: "base" },
  categoryIds: null,
  ...overrides,
});

describe("precios masivos", () => {
  it("aplica porcentaje con redondeo exacto en enteros", () => {
    expect(newPrice(1_250_000, rule())).toBe(1_380_000); // 13.750 → 13.800 (al $100 más cercano)
    expect(newPrice(1_250_000, rule({ rounding: { step: 10_000, mode: "down" } }))).toBe(1_370_000);
    expect(newPrice(1_250_000, rule({ rounding: { step: 1, mode: "none" } }))).toBe(1_375_000);
  });

  it("suma o resta un importe fijo sin bajar de cero", () => {
    expect(newPrice(1_000_000, rule({ change: { type: "amount", minor: 50_000 }, rounding: { step: 1, mode: "none" } }))).toBe(1_050_000);
    expect(newPrice(30_000, rule({ change: { type: "amount", minor: -50_000 }, rounding: { step: 1, mode: "none" } }))).toBe(0);
  });

  it("en el precio general avisa qué sucursales conservan su precio propio", () => {
    const changes = computeBulkPriceChanges(items, rule());
    expect(changes.map((c) => [c.target, c.variantId ?? c.productId, c.from, c.to])).toEqual([
      ["product", "p1", 1_250_000, 1_380_000],
      ["product", "p2", 2_000_000, 2_200_000],
      ["variant", "v1", 1_000_000, 1_100_000],
      ["variant", "v2", 1_500_000, 1_650_000],
    ]);
    expect(changes.find((c) => c.productId === "p2")?.keepsOwnPrice).toEqual(["belgrano"]);
  });

  it("en una sucursal parte de su precio propio o del general", () => {
    const changes = computeBulkPriceChanges(items, rule({ target: { type: "branch", branchId: "belgrano" }, categoryIds: ["c1"] }));
    expect(changes).toEqual([
      expect.objectContaining({ target: "product_branch", productId: "p1", storedFrom: null, baseFrom: 1_250_000, from: 1_250_000, to: 1_380_000 }),
      expect.objectContaining({ target: "product_branch", productId: "p2", storedFrom: 2_200_000, baseFrom: 2_000_000, from: 2_200_000, to: 2_420_000 }),
    ]);
  });

  it("respeta el alcance por categorías y omite precios sin cambio o sin precio", () => {
    const changes = computeBulkPriceChanges(items, rule({ categoryIds: ["c2"] }));
    expect(changes.map((c) => c.variantId)).toEqual(["v1", "v2"]);
    expect(computeBulkPriceChanges(items, rule({ change: { type: "percent", basisPoints: 1 } }))).toEqual([]);
  });

  it("la huella cambia si cambia un precio de origen", () => {
    const a = changesFingerprint(computeBulkPriceChanges(items, rule()));
    const modified = items.map((i) => (i.productId === "p1" ? { ...i, basePrice: 1_260_000 } : i));
    const b = changesFingerprint(computeBulkPriceChanges(modified, rule()));
    expect(a).not.toBe(b);
    expect(changesFingerprint(computeBulkPriceChanges([...items].reverse(), rule()))).toBe(a);
  });

  it("ofrece pasos de redondeo según la moneda", () => {
    expect(roundingSteps("ARS")).toEqual([1_000, 5_000, 10_000, 50_000, 100_000]);
    expect(roundingSteps("USD")[0]).toBe(5);
    expect(roundingSteps("CLP")[0]).toBe(10);
  });
});
