-- CartaLista · Autorización y RLS
--
-- Modelo:
--   * Lecturas: los usuarios autenticados solo tienen SELECT, filtrado por RLS.
--   * Escrituras: solo mediante funciones (RPC) que validan negocio, rol y
--     alcance de sucursal con auth.uid(). No hay INSERT/UPDATE/DELETE directos.
--   * anon: sin acceso a tablas. Solo funciones públicas específicas.

-- ---------------------------------------------------------------------------
-- Matriz de permisos (mantener sincronizada con src/domain/permissions.ts;
-- hay una prueba de integración que compara ambas).
-- ---------------------------------------------------------------------------
create or replace function app.role_permits(p_role text, p_can_publish boolean, p_permission text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_permission
    when 'business.view' then p_role in ('owner', 'admin', 'editor')
    when 'business.update' then p_role in ('owner', 'admin')
    when 'branches.manage' then p_role in ('owner', 'admin')
    when 'team.view' then p_role in ('owner', 'admin')
    when 'team.manage' then p_role in ('owner', 'admin')
    when 'plan.view' then p_role in ('owner', 'admin')
    when 'audit.view' then p_role in ('owner', 'admin')
    when 'menus.manage' then p_role in ('owner', 'admin')
    when 'catalog.edit' then p_role in ('owner', 'admin', 'editor')
    when 'catalog.publish' then p_role in ('owner', 'admin') or (p_role = 'editor' and coalesce(p_can_publish, false))
    when 'imports.create' then p_role in ('owner', 'admin', 'editor')
    when 'history.view' then p_role in ('owner', 'admin', 'editor')
    when 'history.restore' then p_role in ('owner', 'admin') or (p_role = 'editor' and coalesce(p_can_publish, false))
    when 'stats.view' then p_role in ('owner', 'admin', 'editor')
    when 'promotions.manage' then p_role in ('owner', 'admin') or (p_role = 'editor' and coalesce(p_can_publish, false))
    else false
  end;
$$;

-- Rango de roles para impedir que alguien otorgue más de lo que tiene.
create or replace function app.role_rank(p_role text)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'editor' then 1 else 0 end;
$$;

-- Un rol puede otorgar/modificar: owner → owner/admin/editor; admin → editor.
create or replace function app.can_grant_role(p_actor_role text, p_target_role text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_actor_role
    when 'owner' then p_target_role in ('owner', 'admin', 'editor')
    when 'admin' then p_target_role = 'editor'
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Predicados para RLS (SECURITY DEFINER para no recursar sobre memberships)
-- ---------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()));
$$;

create or replace function app.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function app.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and app.role_permits(m.role, m.can_publish, p_permission)
  );
$$;

create or replace function app.can_access_branch(p_business_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (
        m.all_branches
        or exists (select 1 from public.membership_branches mb where mb.membership_id = m.id and mb.branch_id = p_branch_id)
      )
  );
$$;

-- Ver un menú: acceso a todas las sucursales o a alguna de las del menú.
create or replace function app.can_view_menu(p_business_id uuid, p_menu_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = (select auth.uid()) and m.status = 'active'
      and (
        m.all_branches
        or exists (
          select 1 from public.menu_branches x
          join public.membership_branches mb on mb.branch_id = x.branch_id and mb.membership_id = m.id
          where x.menu_id = p_menu_id
        )
      )
  );
$$;

-- ¿Comparten negocio? (para mostrar nombres en historial y equipo)
create or replace function app.shares_business(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.business_id = mine.business_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active' and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Guardas para RPC: lanzan errores de dominio.
-- Si el usuario no pertenece al negocio se responde not_found (no se revela
-- la existencia de datos de otros negocios).
-- ---------------------------------------------------------------------------
create or replace function app.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform app.fail(401, 'not_authenticated');
  end if;
  return v_uid;
end;
$$;

create or replace function app.require_member(p_business_id uuid)
returns public.memberships
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships;
begin
  perform app.require_user();
  select * into v_membership
  from public.memberships
  where business_id = p_business_id and user_id = auth.uid() and status = 'active';
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  return v_membership;
end;
$$;

create or replace function app.require_permission(p_business_id uuid, p_permission text)
returns public.memberships
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships := app.require_member(p_business_id);
begin
  if not app.role_permits(v_membership.role, v_membership.can_publish, p_permission) then
    perform app.fail(403, 'forbidden', p_permission);
  end if;
  return v_membership;
end;
$$;

create or replace function app.require_active_business(p_business_id uuid)
returns public.businesses
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  if v_business.status = 'suspended' then
    perform app.fail(403, 'business_suspended');
  end if;
  return v_business;
end;
$$;

create or replace function app.membership_covers_branch(p_membership public.memberships, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_membership.all_branches
      or exists (
        select 1 from public.membership_branches mb
        where mb.membership_id = p_membership.id and mb.branch_id = p_branch_id
      );
$$;

-- El contenido base de un menú afecta a todas sus sucursales: para editarlo hace
-- falta alcance sobre todas ellas.
create or replace function app.membership_covers_menu(p_membership public.memberships, p_menu_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_membership.all_branches
      or (
        exists (select 1 from public.menu_branches x where x.menu_id = p_menu_id)
        and not exists (
          select 1 from public.menu_branches x
          where x.menu_id = p_menu_id
            and not exists (
              select 1 from public.membership_branches mb
              where mb.membership_id = p_membership.id and mb.branch_id = x.branch_id
            )
        )
      );
$$;

-- Devuelve el menú si el usuario puede editar su borrador. Valida negocio activo,
-- permiso, alcance de sucursales y que el menú no esté archivado.
create or replace function app.require_menu_edit(p_menu_id uuid, p_allow_archived boolean default false)
returns public.menus
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_membership public.memberships;
begin
  perform app.require_user();
  select * into v_menu from public.menus where id = p_menu_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_menu.business_id, 'catalog.edit');
  if not app.can_view_menu(v_menu.business_id, p_menu_id) then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_active_business(v_menu.business_id);
  if not app.membership_covers_menu(v_membership, p_menu_id) then
    perform app.fail(403, 'branch_scope');
  end if;
  if v_menu.status = 'archived' and not p_allow_archived then
    perform app.fail(409, 'menu_archived');
  end if;
  return v_menu;
end;
$$;

create or replace function app.require_menu_view(p_menu_id uuid)
returns public.menus
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
begin
  perform app.require_user();
  select * into v_menu from public.menus where id = p_menu_id;
  if not found or not app.can_view_menu(v_menu.business_id, v_menu.id) then
    perform app.fail(404, 'not_found');
  end if;
  return v_menu;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_branches enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_branches enable row level security;
alter table public.plan_assignments enable row level security;
alter table public.ai_usage_months enable row level security;
alter table public.audit_log enable row level security;
alter table public.media enable row level security;
alter table public.menus enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_extras enable row level security;
alter table public.menu_branches enable row level security;
alter table public.product_branch_overrides enable row level security;
alter table public.variant_branch_prices enable row level security;
alter table public.publications enable row level security;
alter table public.menu_versions enable row level security;
alter table public.imports enable row level security;
alter table public.import_branches enable row level security;
alter table public.import_categories enable row level security;
alter table public.import_images enable row level security;
alter table public.import_proposals enable row level security;
alter table public.worker_heartbeats enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_business(id));

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy plans_select on public.plans for select to authenticated
  using (true);

create policy businesses_select on public.businesses for select to authenticated
  using (app.is_member(id));

create policy branches_select on public.branches for select to authenticated
  using (app.can_access_branch(business_id, id));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or app.has_permission(business_id, 'team.view'));

create policy membership_branches_select on public.membership_branches for select to authenticated
  using (
    exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = (select auth.uid()))
    or app.has_permission(business_id, 'team.view')
  );

create policy invitations_select on public.invitations for select to authenticated
  using (app.has_permission(business_id, 'team.view'));

create policy invitation_branches_select on public.invitation_branches for select to authenticated
  using (app.has_permission(business_id, 'team.view'));

create policy plan_assignments_select on public.plan_assignments for select to authenticated
  using (app.has_permission(business_id, 'plan.view'));

create policy ai_usage_months_select on public.ai_usage_months for select to authenticated
  using (app.is_member(business_id));

create policy audit_log_select on public.audit_log for select to authenticated
  using (business_id is not null and app.has_permission(business_id, 'audit.view'));

create policy media_select on public.media for select to authenticated
  using (app.is_member(business_id));

create policy menus_select on public.menus for select to authenticated
  using (app.can_view_menu(business_id, id));

create policy categories_select on public.categories for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy products_select on public.products for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy product_variants_select on public.product_variants for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy product_extras_select on public.product_extras for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy menu_branches_select on public.menu_branches for select to authenticated
  using (app.can_view_menu(business_id, menu_id) and app.can_access_branch(business_id, branch_id));

create policy product_branch_overrides_select on public.product_branch_overrides for select to authenticated
  using (app.can_view_menu(business_id, menu_id) and app.can_access_branch(business_id, branch_id));

create policy variant_branch_prices_select on public.variant_branch_prices for select to authenticated
  using (app.can_view_menu(business_id, menu_id) and app.can_access_branch(business_id, branch_id));

create policy publications_select on public.publications for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy menu_versions_select on public.menu_versions for select to authenticated
  using (app.can_view_menu(business_id, menu_id) and app.can_access_branch(business_id, branch_id));

create policy imports_select on public.imports for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy import_branches_select on public.import_branches for select to authenticated
  using (exists (select 1 from public.imports i where i.id = import_id));

create policy import_categories_select on public.import_categories for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy import_images_select on public.import_images for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

create policy import_proposals_select on public.import_proposals for select to authenticated
  using (app.can_view_menu(business_id, menu_id));

-- worker_heartbeats: sin políticas (solo service role).

-- ---------------------------------------------------------------------------
-- Privilegios de tabla: solo lectura para authenticated; nada para anon.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.profiles,
  public.platform_admins,
  public.plans,
  public.businesses,
  public.branches,
  public.memberships,
  public.membership_branches,
  public.invitation_branches,
  public.plan_assignments,
  public.ai_usage_months,
  public.audit_log,
  public.media,
  public.menus,
  public.categories,
  public.products,
  public.product_variants,
  public.product_extras,
  public.menu_branches,
  public.product_branch_overrides,
  public.variant_branch_prices,
  public.publications,
  public.menu_versions,
  public.imports,
  public.import_branches,
  public.import_categories,
  public.import_images,
  public.import_proposals
to authenticated;

-- El hash del token de invitación nunca se expone.
grant select (
  id, business_id, email, role, can_publish, all_branches, expires_at,
  created_by, created_by_platform, created_at, accepted_at, accepted_by, revoked_at, revoked_by
) on public.invitations to authenticated;
