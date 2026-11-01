// Códigos de error de dominio (los mismos que lanza la base con app.fail) y su
// mensaje en español. Los mensajes dicen qué pasó y qué hacer.

export interface AppError {
  code: string;
  message: string;
  detail?: string;
  field?: string;
}

const MESSAGES: Record<string, string | ((detail?: string) => string)> = {
  session_expired: "Tu sesión venció. Iniciá sesión de nuevo para continuar; lo que escribiste sigue acá.",
  not_authenticated: "Tu sesión venció. Iniciá sesión de nuevo para continuar; lo que escribiste sigue acá.",
  forbidden: "No tenés permiso para hacer esto. Pedile acceso a quien administra el negocio.",
  branch_scope: "Esta acción incluye sucursales a las que no tenés acceso.",
  not_found: "No encontramos lo que buscabas. Puede que se haya eliminado o que no tengas acceso.",
  business_suspended: "La cuenta está suspendida: podés consultar la información, pero no hacer cambios.",
  email_not_confirmed: "Confirmá tu email antes de continuar. Revisá tu bandeja de entrada.",
  revision_conflict: "Otra persona modificó esto mientras lo editabas. Revisá la versión actual antes de guardar.",
  stale_order: "El orden cambió mientras lo editabas. Recargá la página y probá de nuevo.",
  slug_taken: "Esa dirección ya está en uso. Probá con otra.",
  branch_slug_taken: "Esa dirección de carta ya está en uso. Probá con otra.",
  invalid_slug: "Usá solo minúsculas, números y guiones (de 3 a 60 caracteres).",
  invalid_branch_slug: "Usá solo minúsculas, números y guiones (de 3 a 60 caracteres).",
  invalid_timezone: "Elegí una zona horaria de la lista.",
  too_many_businesses: "Llegaste al máximo de negocios por cuenta. Escribinos si necesitás más.",
  category_name_taken: "Ya hay una categoría con ese nombre en esta carta.",
  product_name_taken: (d) => (d ? `Ya hay un producto llamado «${d}» en esa categoría.` : "Ya hay un producto con ese nombre en esta categoría."),
  variant_name_taken: "Hay dos variantes con el mismo nombre. Cambiá uno.",
  extra_name_taken: "Hay dos extras con el mismo nombre. Cambiá uno.",
  category_not_empty: (d) => `La categoría tiene ${d ?? "algunos"} productos. Elegí a qué categoría moverlos.`,
  menu_archived: "Esta carta está archivada. Restaurala para editarla o publicarla.",
  product_archived: "Este producto está archivado. Restauralo para editarlo.",
  invalid_category: "Elegí una categoría de esta carta.",
  invalid_media: "La foto no es válida para este negocio. Subila de nuevo.",
  invalid_price: "Revisá el precio: tiene que ser un importe válido.",
  invalid_amount: "Revisá el precio: tiene que ser un importe válido.",
  invalid_name: "El nombre es obligatorio (hasta 120 caracteres).",
  description_too_long: "La descripción es demasiado larga (máximo 600 caracteres).",
  too_many_products: "Esta carta llegó al máximo de productos.",
  too_many_categories: "Esta carta llegó al máximo de categorías.",
  plan_limit_branches: (d) => `Tu plan permite hasta ${d ?? "ese número de"} sucursales. Pedí un cambio de plan para agregar más.`,
  plan_limit_members: (d) => `Tu plan permite hasta ${d ?? "ese número de"} personas en el equipo, contando invitaciones abiertas.`,
  plan_limit_menus: (d) => `Tu plan permite hasta ${d ?? "ese número de"} cartas activas. Archivá una o pedí un cambio de plan.`,
  quota_exceeded: (d) =>
    `Llegaste al límite de fotos procesadas de tu plan este mes${d ? ` (te quedan ${d})` : ""}. Podés seguir editando a mano.`,
  already_member: "Esa persona ya es parte del equipo.",
  role_not_grantable: "No podés otorgar ese rol.",
  cannot_modify_self: "No podés cambiar tu propio acceso. Pedíselo a otra persona con permisos.",
  last_owner: "El negocio necesita al menos un propietario.",
  membership_revoked: "Esa persona ya no tiene acceso.",
  branches_required: "Elegí al menos una sucursal.",
  invalid_branch: "Alguna de las sucursales elegidas no es válida.",
  branch_not_in_menu: "Esta carta no se muestra en esa sucursal.",
  invalid_email: "Revisá el email.",
  invitation_invalid: "El enlace de invitación no es válido. Pedí uno nuevo.",
  invitation_expired: "La invitación venció. Pedí que te envíen una nueva.",
  invitation_used: "Esta invitación ya se usó.",
  invitation_revoked: "Esta invitación fue cancelada.",
  invitation_email_mismatch: "La invitación es para otro email. Ingresá con la cuenta del email invitado.",
  invitation_already_accepted: "La invitación ya fue aceptada.",
  brand_color_not_legible: "Ese color no tiene contraste suficiente con el texto. Elegí uno más oscuro.",
  currency_change_blocked: "No se puede cambiar a una moneda con otra cantidad de decimales cuando ya hay precios cargados.",
  invalid_currency: "Elegí una moneda de la lista.",
  files_required: "Agregá al menos una foto.",
  too_many_files: (d) => `Podés subir hasta ${d ?? "algunas"} fotos por importación.`,
  file_too_large: "Alguna foto es demasiado pesada. Probá con una de menor tamaño.",
  invalid_file_type: "Usá fotos en formato JPG, PNG o WebP.",
  duplicate_image: "Subiste la misma foto dos veces. Quitá la repetida.",
  duplicate_import: "Ya hay una importación en curso con estas mismas fotos.",
  invalid_image: "Alguna foto no se pudo validar. Volvé a subirla.",
  image_unreadable: "La imagen no se pudo leer. Probá con una foto más nítida.",
  pending_decisions: (d) => `Quedan ${d ?? "algunos"} cambios sin decidir. Aprobalos o descartalos para aplicar.`,
  import_not_in_review: "Esta importación ya no está en revisión.",
  proposal_closed: "Este cambio ya se aplicó o se descartó.",
  proposal_not_applicable: "Este cambio no se puede aplicar con el alcance elegido.",
  correction_required: "Escribí el dato correcto para aprobar este cambio.",
  resolution_required: "Indicá si es el mismo producto o uno nuevo.",
  correction_field_not_allowed: "Con este alcance solo se pueden corregir precios.",
  scope_violation: "Este cambio está fuera del alcance de la importación.",
  apply_conflict: "Alguien modificó la carta mientras aplicabas los cambios. Revisá los conflictos y probá de nuevo.",
  invalid_proposal: "Un cambio tiene datos incompletos y no se aplicó nada. Corregilo y probá de nuevo.",
  proposal_empty: "Un cambio aprobado no modificaba nada y no se aplicó ningún cambio. Revisalo y probá de nuevo.",
  restore_draft_shared_menu: "Esta carta se usa en varias sucursales: no se puede reemplazar el borrador desde una sola.",
  categories_required: "Elegí al menos una categoría para actualizar.",
  duplicate: "Ya existe un elemento con esos datos.",
  invalid_correction: "Revisá el dato corregido.",
  invalid_role: "Elegí un rol válido.",
  invalid_expiration: "Elegí un vencimiento válido para la invitación.",
  public_slug_immutable: "La dirección pública de la carta no se puede cambiar: los QR impresos dejarían de funcionar.",
  version_immutable: "Las versiones publicadas no se pueden modificar.",
  reason_required: "Escribí el motivo de la suspensión (lo verá el equipo del negocio).",
  invalid_plan: "Elegí un plan activo.",
  plan_code_taken: "Ya hay un plan con ese código.",
  user_not_found: "No hay ninguna cuenta con ese email.",
  lease_lost: "El procesamiento se reasignó a otro proceso.",
  price_conflict: (d) =>
    d
      ? `El precio de «${d}» cambió mientras revisabas la vista previa. No se aplicó ningún cambio: generá la vista previa de nuevo.`
      : "Algún precio cambió mientras revisabas la vista previa. No se aplicó ningún cambio: generá la vista previa de nuevo.",
  bulk_preview_stale: "Los precios cambiaron desde la vista previa. No se aplicó ningún cambio: revisá la vista previa actualizada.",
  no_price_changes: "Con esta regla ningún precio cambia. Probá con otro porcentaje, importe o redondeo.",
  too_many_price_changes: "Son demasiados precios para un solo cambio. Elegí menos categorías.",
  invalid_price_change: "La vista previa tiene datos inválidos. Generala de nuevo.",
  daily_menu_overlap: (d) =>
    d
      ? `Se superpone con el menú del día «${d}» en alguna sucursal. Cambiá las fechas, los días o el horario, o pausá el otro.`
      : "Se superpone con otro menú del día en alguna sucursal. Cambiá las fechas, los días o el horario.",
  promotion_no_dates: "Con esos días de la semana no queda ninguna fecha dentro del período elegido.",
  promotion_time_order: "La hora de fin tiene que ser posterior a la de inicio.",
  promotion_in_past: "La fecha de fin ya pasó. Elegí un período que termine hoy o más adelante.",
  invalid_promotion_schedule: "Revisá las fechas, los días y el horario.",
  invalid_promotion_items: "Revisá los ítems: hasta 12, de hasta 120 caracteres cada uno.",
  invalid_promotion_title: "El título es obligatorio (de 2 a 80 caracteres).",
  invalid_promotion_kind: "El tipo de publicación no es válido.",
  idempotency_key_required: "Recargá la página y probá de nuevo.",
  ai_not_configured: "El procesamiento con IA necesita configuración. Mientras tanto podés cargar la carta a mano.",
  upload_failed: "No pudimos subir la foto. Revisá tu conexión y probá de nuevo.",
  network: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
  validation: "Revisá los datos marcados.",
  unknown: "Algo salió mal. Probá de nuevo en unos segundos.",
};

export function errorMessage(code: string, detail?: string): string {
  const entry = MESSAGES[code];
  if (typeof entry === "function") return entry(detail);
  if (typeof entry === "string") return entry;
  if (code.startsWith("invalid_")) return "Revisá los datos ingresados.";
  return MESSAGES.unknown as string;
}

export function appError(code: string, detail?: string, field?: string): AppError {
  return { code, message: errorMessage(code, detail), detail, field };
}
