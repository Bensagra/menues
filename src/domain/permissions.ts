// Matriz explícita de permisos por rol. Es un espejo de app.role_permits() en
// la base: la base es la autoridad final; esto se usa para mostrar u ocultar
// acciones y para validar antes de llamar al servidor. Una prueba de
// integración verifica que ambas definiciones coincidan.

export type Role = "owner" | "admin" | "editor";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Control total del negocio, incluido el equipo y el plan.",
  admin: "Administra cartas, sucursales y editores. No puede cambiar propietarios ni administradores.",
  editor: "Edita borradores de las sucursales asignadas. Publica solo si tiene ese permiso.",
};

export const PERMISSIONS = [
  "business.view",
  "business.update",
  "branches.manage",
  "team.view",
  "team.manage",
  "plan.view",
  "audit.view",
  "menus.manage",
  "catalog.edit",
  "catalog.publish",
  "imports.create",
  "history.view",
  "history.restore",
  "stats.view",
  "promotions.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type Rule = Role[] | { roles: Role[]; editorWithPublish: true };

const MATRIX: Record<Permission, Rule> = {
  "business.view": ["owner", "admin", "editor"],
  "business.update": ["owner", "admin"],
  "branches.manage": ["owner", "admin"],
  "team.view": ["owner", "admin"],
  "team.manage": ["owner", "admin"],
  "plan.view": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
  "menus.manage": ["owner", "admin"],
  "catalog.edit": ["owner", "admin", "editor"],
  "catalog.publish": { roles: ["owner", "admin"], editorWithPublish: true },
  "imports.create": ["owner", "admin", "editor"],
  "history.view": ["owner", "admin", "editor"],
  "history.restore": { roles: ["owner", "admin"], editorWithPublish: true },
  "stats.view": ["owner", "admin", "editor"],
  "promotions.manage": { roles: ["owner", "admin"], editorWithPublish: true },
};

export function rolePermits(role: Role, canPublish: boolean, permission: Permission): boolean {
  const rule = MATRIX[permission];
  if (Array.isArray(rule)) return rule.includes(role);
  return rule.roles.includes(role) || (role === "editor" && canPublish);
}

/** Roles que un actor puede otorgar o modificar. Nadie puede tocar su propia membresía. */
export function grantableRoles(actorRole: Role): Role[] {
  if (actorRole === "owner") return ["owner", "admin", "editor"];
  if (actorRole === "admin") return ["editor"];
  return [];
}

export function canGrantRole(actorRole: Role, targetRole: Role): boolean {
  return grantableRoles(actorRole).includes(targetRole);
}

export interface MembershipScope {
  role: Role;
  canPublish: boolean;
  allBranches: boolean;
  branchIds: string[];
}

export function coversBranch(scope: MembershipScope, branchId: string): boolean {
  return scope.allBranches || scope.branchIds.includes(branchId);
}

/** El contenido base de una carta afecta a todas sus sucursales. */
export function coversMenu(scope: MembershipScope, menuBranchIds: string[]): boolean {
  if (scope.allBranches) return true;
  return menuBranchIds.length > 0 && menuBranchIds.every((id) => scope.branchIds.includes(id));
}

export function permissionsFor(scope: Pick<MembershipScope, "role" | "canPublish">): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSIONS.map((p) => [p, rolePermits(scope.role, scope.canPublish, p)])) as Record<
    Permission,
    boolean
  >;
}
