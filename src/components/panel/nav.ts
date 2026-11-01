import {
  BookOpen,
  Camera,
  ChartColumn,
  History,
  House,
  QrCode,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/domain/permissions";

export interface NavItem {
  key: string;
  label: string;
  href: (base: string) => string;
  icon: LucideIcon;
  exact?: boolean;
  permission?: Permission;
  anyPermission?: Permission[];
}

export const PANEL_NAV: NavItem[] = [
  { key: "inicio", label: "Inicio", href: (b) => b, icon: House, exact: true },
  { key: "menus", label: "Menús", href: (b) => `${b}/menus`, icon: BookOpen },
  { key: "actualizar", label: "Actualizar con foto", href: (b) => `${b}/actualizar`, icon: Camera, permission: "imports.create" },
  { key: "historial", label: "Historial", href: (b) => `${b}/historial`, icon: History, permission: "history.view" },
  { key: "qr", label: "QR y difusión", href: (b) => `${b}/qr`, icon: QrCode },
  { key: "estadisticas", label: "Estadísticas", href: (b) => `${b}/estadisticas`, icon: ChartColumn, permission: "stats.view" },
  {
    key: "configuracion",
    label: "Configuración",
    href: (b) => `${b}/configuracion`,
    icon: Settings,
    anyPermission: ["business.update", "branches.manage", "team.view", "plan.view"],
  },
];

export const SETTINGS_NAV: { key: string; label: string; href: (base: string) => string; permission: Permission }[] = [
  { key: "local", label: "Local", href: (b) => `${b}/configuracion`, permission: "business.update" },
  { key: "sucursales", label: "Sucursales", href: (b) => `${b}/configuracion/sucursales`, permission: "branches.manage" },
  { key: "equipo", label: "Equipo", href: (b) => `${b}/configuracion/equipo`, permission: "team.view" },
  { key: "plan", label: "Plan", href: (b) => `${b}/configuracion/plan`, permission: "plan.view" },
];

export function visibleNav(permissions: Record<Permission, boolean>) {
  return PANEL_NAV.filter(
    (item) =>
      (!item.permission || permissions[item.permission]) &&
      (!item.anyPermission || item.anyPermission.some((p) => permissions[p])),
  );
}
