import Link from "next/link";
import { cn } from "cn";
import { SETTINGS_NAV } from "@/components/panel/nav";
import type { Permission } from "@/domain/permissions";

export function SettingsNav({ base, current, permissions }: { base: string; current: string; permissions: Record<Permission, boolean> }) {
  const items = SETTINGS_NAV.filter((item) => permissions[item.permission]);
  return (
    <nav aria-label="Secciones de configuración" className="-mx-1 mb-6 overflow-x-auto">
      <ul className="flex gap-1 px-1">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href(base)}
              aria-current={current === item.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold whitespace-nowrap",
                current === item.key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-[#efece4] hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
