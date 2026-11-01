import { cn } from "cn";
import { formatMoney } from "@/domain/money";

export function Price({
  minor,
  currency,
  locale = "es-AR",
  className,
  fallback = "Sin precio",
}: {
  minor: number | null | undefined;
  currency: string;
  locale?: string;
  className?: string;
  fallback?: string;
}) {
  if (minor === null || minor === undefined) {
    return <span className={cn("text-muted-foreground", className)}>{fallback}</span>;
  }
  return <span className={cn("price", className)}>{formatMoney(minor, currency, locale)}</span>;
}
