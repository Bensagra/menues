"use client";

import { useState } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { formatMoney, minorToInputValue, parseMoneyInput } from "@/domain/money";

const ERRORS: Record<string, string> = {
  invalid: "Escribí un importe válido, por ejemplo 12.500 o 12.500,50.",
  too_many_decimals: "Demasiados decimales para esta moneda.",
  too_large: "El importe es demasiado grande.",
  negative: "El importe no puede ser negativo.",
};

/**
 * Campo de precio. Guarda unidades menores exactas; acepta el formato local
 * (12.500,50) y también punto decimal.
 */
export function MoneyInput({
  value,
  onValueChange,
  currency,
  locale = "es-AR",
  id,
  className,
  allowEmpty = true,
  ...aria
}: {
  value: number | null;
  onValueChange: (minor: number | null, error: string | null) => void;
  currency: string;
  locale?: string;
  id?: string;
  className?: string;
  allowEmpty?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => minorToInputValue(value, currency));
  const [synced, setSynced] = useState({ value, currency });

  // Si el valor cambia desde afuera, se actualiza el texto (estado derivado, sin efectos).
  if (synced.value !== value || synced.currency !== currency) {
    setSynced({ value, currency });
    const parsed = parseMoneyInput(text, currency);
    if ((parsed.ok ? parsed.minor : null) !== value) setText(minorToInputValue(value, currency));
  }

  const symbol = formatMoney(0, currency, locale).replace(/[\d\s., ]/g, "") || "$";

  return (
    <div className={cn("relative", className)}>
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground">
        {symbol}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="price pl-8"
        value={text}
        placeholder="0"
        {...aria}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (!next.trim()) {
            onValueChange(null, allowEmpty ? null : "Ingresá un precio.");
            return;
          }
          const parsed = parseMoneyInput(next, currency);
          if (parsed.ok) onValueChange(parsed.minor, null);
          else onValueChange(value, ERRORS[parsed.error] ?? ERRORS.invalid);
        }}
        onBlur={() => {
          const parsed = parseMoneyInput(text, currency);
          if (parsed.ok) setText(minorToInputValue(parsed.minor, currency));
        }}
      />
    </div>
  );
}
