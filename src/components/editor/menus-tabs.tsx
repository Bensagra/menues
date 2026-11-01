import Link from "next/link";
import { BookOpen, CalendarClock } from "lucide-react";

/** Pestañas de la sección Menús: cartas y programación (menú del día y promociones). */
export function MenusTabs({ base, current }: { base: string; current: "cartas" | "promociones" }) {
  const tabs = [
    { key: "cartas", label: "Cartas", href: `${base}/menus`, icon: BookOpen },
    { key: "promociones", label: "Menú del día y promociones", href: `${base}/menus/promociones`, icon: CalendarClock },
  ] as const;
  return (
    <nav aria-label="Secciones de menús" className="-mx-1 mb-6 overflow-x-auto">
      <ul className="flex gap-1 border-b border-border px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap ${
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
