"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Camera, Ellipsis, House, BookOpen } from "lucide-react";
import type { Permission } from "@/domain/permissions";
import { visibleNav } from "./nav";

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ base, permissions }: { base: string; permissions: Record<Permission, boolean> }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del panel">
      <ul className="grid gap-1">
        {visibleNav(permissions).map((item) => {
          const href = item.href(base);
          const active = isActive(pathname, href, item.exact);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold transition-colors",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-[#efece4] hover:text-foreground",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "")} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BottomNav({ base, permissions }: { base: string; permissions: Record<Permission, boolean> }) {
  const pathname = usePathname();
  const items = [
    { key: "inicio", label: "Inicio", href: base, icon: House, exact: true },
    { key: "menus", label: "Menús", href: `${base}/menus`, icon: BookOpen },
    ...(permissions["imports.create"] ? [{ key: "actualizar", label: "Actualizar", href: `${base}/actualizar`, icon: Camera }] : []),
    { key: "mas", label: "Más", href: `${base}/mas`, icon: Ellipsis },
  ];
  const moreActive = ["historial", "diseno", "qr", "estadisticas", "configuracion", "mas"].some((s) => pathname.startsWith(`${base}/${s}`));
  return (
    <nav aria-label="Secciones del panel" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden">
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = item.key === "mas" ? moreActive : isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
