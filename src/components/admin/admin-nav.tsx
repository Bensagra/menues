"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Building2, Cpu, Gauge, ScrollText, Tags, Users } from "lucide-react";

const ITEMS = [
  { href: "/admin", label: "Resumen", icon: Gauge, exact: true },
  { href: "/admin/negocios", label: "Negocios", icon: Building2 },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/procesamientos", label: "Procesamientos", icon: Cpu },
  { href: "/admin/planes", label: "Planes y límites", icon: Tags },
  { href: "/admin/auditoria", label: "Auditoría", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administración" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 px-1 lg:flex-col">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap",
                  active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-[#efece4] hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
