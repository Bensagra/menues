import type { LucideIcon } from "lucide-react";
import { CircleHelp, Copy, EyeOff, FolderPlus, Layers, ListPlus, PencilLine, SearchX, Tag, TextCursorInput, Equal } from "lucide-react";

export const KIND_META: Record<string, { label: string; icon: LucideIcon; tone: "price" | "new" | "review" | "neutral" | "detail" }> = {
  price_change: { label: "Cambio de precio", icon: Tag, tone: "price" },
  variant_change: { label: "Cambio de variantes", icon: Layers, tone: "price" },
  new_product: { label: "Producto nuevo", icon: ListPlus, tone: "new" },
  new_category: { label: "Categoría nueva", icon: FolderPlus, tone: "new" },
  name_change: { label: "Cambio de nombre", icon: TextCursorInput, tone: "detail" },
  description_change: { label: "Cambio de descripción", icon: PencilLine, tone: "detail" },
  uncertain_match: { label: "Coincidencia dudosa", icon: CircleHelp, tone: "review" },
  possible_duplicate: { label: "Posible duplicado", icon: Copy, tone: "review" },
  illegible: { label: "Dato ilegible", icon: EyeOff, tone: "review" },
  no_change: { label: "Sin cambios", icon: Equal, tone: "neutral" },
  not_found: { label: "No está en tu carta", icon: SearchX, tone: "neutral" },
};

export const FLAG_LABELS: Record<string, string> = {
  price_decimal_or_thousands: "Precio con formato ambiguo",
  price_multiple_prices: "Más de un precio impreso",
  price_model_disagrees: "Lectura dudosa del precio",
  price_no_printed_text: "Precio sin texto impreso",
  price_invalid: "Precio no válido",
  price_illegible: "Precio ilegible",
  large_change: "Cambio grande",
  repeated_in_photos: "Aparece en varias fotos",
  conflicting_values: "Valores distintos entre fotos",
  currency_mismatch: "Moneda distinta a la tuya",
  branch_specific_price: "Precio propio de la sucursal",
  affects_other_branches: "Afecta a otras sucursales",
  variant_structure: "Precio único en un producto con variantes",
  new_variant: "Variante nueva",
  adds_variants: "Agrega variantes",
  new_variant_ignored: "Variante nueva ignorada",
  no_price: "Sin precio impreso",
  category_required: "Falta la categoría",
  name_illegible: "Nombre ilegible",
};

export type ReviewFilter = "all" | "prices" | "new" | "review";

export const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "prices", label: "Precios" },
  { value: "new", label: "Nuevos" },
  { value: "review", label: "Por revisar" },
];
