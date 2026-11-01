import type { ComponentProps } from "react";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";

/** Select nativo con el estilo de la app: accesible y cómodo en mobile para listas largas. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className="h-11 w-full appearance-none rounded-lg border border-input bg-card pr-10 pl-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-60 aria-invalid:border-error"
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

const PREFERRED_ZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Argentina/Mendoza",
  "America/Argentina/Salta",
  "America/Argentina/Ushuaia",
  "America/Montevideo",
  "America/Santiago",
  "America/Asuncion",
  "America/Sao_Paulo",
  "America/La_Paz",
  "America/Lima",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/Madrid",
];

export function TimezoneOptions({ zones }: { zones: string[] }) {
  const preferred = PREFERRED_ZONES.filter((z) => zones.includes(z));
  const rest = zones.filter((z) => !preferred.includes(z));
  return (
    <>
      <optgroup label="Frecuentes">
        {preferred.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </optgroup>
      <optgroup label="Todas">
        {rest.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </optgroup>
    </>
  );
}
