import type { EditorProduct } from "@/server/queries/menus";

export type { EditorProduct };

export interface EditorCategory {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  revision: number;
}

export interface EditorEnv {
  base: string;
  businessId: string;
  currency: string;
  locale: string;
  menuId: string;
  /** Puede editar el contenido compartido del menú (cubre todas sus sucursales). */
  canEditContent: boolean;
  canPublish: boolean;
  canManage: boolean;
  readOnly: boolean;
  branches: { id: string; name: string; accessible: boolean }[];
}

export type StatusFilter = "all" | "available" | "sold_out" | "hidden" | "archived";
