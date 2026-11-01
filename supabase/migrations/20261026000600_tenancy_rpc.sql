-- CartaLista · RPC de negocio, sucursales y equipo
-- Todas las funciones validan con auth.uid(): no aceptan roles ni identidades
-- enviados por el cliente.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function app.current_plan(p_business_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.plans p
  where p.id = coalesce(
    (select pa.plan_id from public.plan_assignments pa where pa.business_id = p_business_id and pa.ends_at is null),
    (select d.id from public.plans d where d.is_default)
  );
$$;

create or replace function app.unique_violation_code(p_constraint text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_constraint
    when 'businesses_slug_key' then 'slug_taken'
    when 'branches_public_slug_key' then 'branch_slug_taken'
    when 'categories_unique_name' then 'category_name_taken'
    when 'products_unique_name' then 'product_name_taken'
    when 'product_variants_unique_name' then 'variant_name_taken'
    when 'product_extras_unique_name' then 'extra_name_taken'
    else 'duplicate'
  end;
$$;

-- Normaliza y valida las sucursales asignadas a un rol.
create or replace function app.normalize_branch_scope(
  p_business_id uuid,
  p_role text,
  p_all_branches boolean,
  p_branch_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce((select array_agg(distinct x) from unnest(p_branch_ids) x where x is not null), '{}');
  v_found int;
begin
  if p_role in ('owner', 'admin') or p_all_branches then
    return '{}';
  end if;
  if cardinality(v_ids) = 0 then
    perform app.fail(422, 'branches_required');
  end if;
  select count(*) into v_found from public.branches where business_id = p_business_id and id = any (v_ids);
  if v_found <> cardinality(v_ids) then
    perform app.fail(422, 'invalid_branch');
  end if;
  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil propio
-- ---------------------------------------------------------------------------
create or replace function public.update_my_profile(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
begin
  if p_full_name is null or char_length(btrim(p_full_name)) > 120 then
    perform app.fail(422, 'invalid_name');
  end if;
  update public.profiles set full_name = btrim(p_full_name) where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: negocio + primera sucursal + membresía owner + plan + carta vacía
-- ---------------------------------------------------------------------------
create or replace function public.slug_available(p_kind text, p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_user();
  if not app.is_valid_slug(p_slug) then
    return false;
  end if;
  if p_kind = 'business' then
    return not exists (select 1 from public.businesses where slug = p_slug);
  elsif p_kind = 'branch' then
    return not exists (select 1 from public.branches where public_slug = p_slug);
  end if;
  return false;
end;
$$;

create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_currency text,
  p_branch_name text,
  p_branch_slug text,
  p_timezone text,
  p_address text default '',
  p_menu_name text default 'Carta'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_confirmed timestamptz;
  v_owned int;
  v_business_id uuid;
  v_branch_id uuid;
  v_menu_id uuid;
  v_constraint text;
begin
  select email_confirmed_at into v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then
    perform app.fail(403, 'email_not_confirmed');
  end if;

  select count(*) into v_owned from public.memberships
  where user_id = v_uid and role = 'owner' and status = 'active';
  if v_owned >= 5 then
    perform app.fail(422, 'too_many_businesses');
  end if;

  if not app.is_valid_slug(p_slug) then
    perform app.fail(422, 'invalid_slug');
  end if;
  if not app.is_valid_slug(p_branch_slug) then
    perform app.fail(422, 'invalid_branch_slug');
  end if;

  insert into public.businesses (name, slug, currency, created_by)
  values (btrim(p_name), p_slug, upper(coalesce(p_currency, 'ARS')), v_uid)
  returning id into v_business_id;

  insert into public.branches (business_id, name, public_slug, timezone, address, created_by)
  values (v_business_id, btrim(p_branch_name), p_branch_slug, p_timezone, btrim(coalesce(p_address, '')), v_uid)
  returning id into v_branch_id;

  insert into public.memberships (business_id, user_id, role, can_publish, all_branches, created_by)
  values (v_business_id, v_uid, 'owner', true, true, v_uid);

  insert into public.plan_assignments (business_id, plan_id, assigned_by, note)
  select v_business_id, id, v_uid, 'Plan asignado automáticamente al crear el negocio'
  from public.plans where is_default;

  insert into public.menus (business_id, name, created_by)
  values (v_business_id, coalesce(nullif(btrim(p_menu_name), ''), 'Carta'), v_uid)
  returning id into v_menu_id;

  insert into public.menu_branches (business_id, menu_id, branch_id)
  values (v_business_id, v_menu_id, v_branch_id);

  perform app.audit(v_business_id, 'business.created', 'business', v_business_id,
    'Creó el negocio ' || btrim(p_name), jsonb_build_object('branch_id', v_branch_id, 'menu_id', v_menu_id));

  return jsonb_build_object(
    'business_id', v_business_id,
    'business_slug', p_slug,
    'branch_id', v_branch_id,
    'menu_id', v_menu_id
  );
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform app.fail(409, app.unique_violation_code(v_constraint));
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuración del negocio
-- ---------------------------------------------------------------------------
create or replace function app.business_has_prices(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.products where business_id = p_business_id and price_minor is not null)
      or exists (select 1 from public.product_variants where business_id = p_business_id and price_minor is not null)
      or exists (select 1 from public.product_extras where business_id = p_business_id)
      or exists (select 1 from public.product_branch_overrides where business_id = p_business_id and price_minor is not null)
      or exists (select 1 from public.variant_branch_prices where business_id = p_business_id);
$$;

create or replace function public.update_business(
  p_business_id uuid,
  p_name text,
  p_description text,
  p_brand_color text,
  p_currency text,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_currency text := upper(coalesce(p_currency, ''));
  v_color text := nullif(btrim(coalesce(p_brand_color, '')), '');
begin
  perform app.require_permission(p_business_id, 'business.update');
  v_business := app.require_active_business(p_business_id);

  if app.currency_exponent(v_currency) is null then
    perform app.fail(422, 'invalid_currency');
  end if;
  if v_currency <> v_business.currency
     and app.currency_exponent(v_currency) <> app.currency_exponent(v_business.currency)
     and app.business_has_prices(p_business_id) then
    perform app.fail(409, 'currency_change_blocked');
  end if;
  if v_color is not null and not app.is_legible_brand_color(v_color) then
    perform app.fail(422, 'brand_color_not_legible');
  end if;

  update public.businesses
  set name = btrim(p_name),
      description = btrim(coalesce(p_description, '')),
      brand_color = upper(v_color),
      currency = v_currency,
      locale = coalesce(nullif(btrim(p_locale), ''), 'es-AR')
  where id = p_business_id;

  perform app.audit(p_business_id, 'business.updated', 'business', p_business_id, 'Actualizó los datos del local',
    jsonb_build_object('name', btrim(p_name), 'currency', v_currency, 'brand_color', upper(v_color)));
end;
$$;

create or replace function public.set_business_media(p_business_id uuid, p_kind text, p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_permission(p_business_id, 'business.update');
  perform app.require_active_business(p_business_id);
  if p_kind not in ('logo', 'cover') then
    perform app.fail(422, 'invalid_kind');
  end if;
  if p_media_id is not null and not exists (
    select 1 from public.media where id = p_media_id and business_id = p_business_id and kind = p_kind
  ) then
    perform app.fail(404, 'not_found');
  end if;
  if p_kind = 'logo' then
    update public.businesses set logo_media_id = p_media_id where id = p_business_id;
  else
    update public.businesses set cover_media_id = p_media_id where id = p_business_id;
  end if;
  perform app.audit(p_business_id, 'business.media_updated', 'business', p_business_id,
    case when p_kind = 'logo' then 'Actualizó el logo' else 'Actualizó la portada' end,
    jsonb_build_object('kind', p_kind, 'media_id', p_media_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Sucursales
-- ---------------------------------------------------------------------------
create or replace function public.create_branch(
  p_business_id uuid,
  p_name text,
  p_public_slug text,
  p_timezone text,
  p_address text,
  p_phone text,
  p_whatsapp text,
  p_public_note text,
  p_opening_hours jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_count int;
  v_branch_id uuid;
  v_constraint text;
begin
  perform app.require_permission(p_business_id, 'branches.manage');
  perform app.require_active_business(p_business_id);
  v_plan := app.current_plan(p_business_id);
  select count(*) into v_count from public.branches where business_id = p_business_id;
  if v_count >= v_plan.max_branches then
    perform app.fail(422, 'plan_limit_branches', v_plan.max_branches::text);
  end if;
  if not app.is_valid_slug(p_public_slug) then
    perform app.fail(422, 'invalid_branch_slug');
  end if;

  insert into public.branches (
    business_id, name, public_slug, timezone, address, phone, whatsapp, public_note, opening_hours, sort_order, created_by
  )
  values (
    p_business_id, btrim(p_name), p_public_slug, p_timezone, btrim(coalesce(p_address, '')),
    btrim(coalesce(p_phone, '')), btrim(coalesce(p_whatsapp, '')), btrim(coalesce(p_public_note, '')),
    coalesce(p_opening_hours, '[]'::jsonb), v_count, auth.uid()
  )
  returning id into v_branch_id;

  perform app.audit(p_business_id, 'branch.created', 'branch', v_branch_id, 'Creó la sucursal ' || btrim(p_name),
    '{}'::jsonb, v_branch_id);
  return v_branch_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform app.fail(409, app.unique_violation_code(v_constraint));
end;
$$;

create or replace function public.update_branch(
  p_branch_id uuid,
  p_name text,
  p_timezone text,
  p_address text,
  p_phone text,
  p_whatsapp text,
  p_public_note text,
  p_opening_hours jsonb,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
begin
  select * into v_branch from public.branches where id = p_branch_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_branch.business_id, 'branches.manage');
  perform app.require_active_business(v_branch.business_id);

  update public.branches
  set name = btrim(p_name),
      timezone = p_timezone,
      address = btrim(coalesce(p_address, '')),
      phone = btrim(coalesce(p_phone, '')),
      whatsapp = btrim(coalesce(p_whatsapp, '')),
      public_note = btrim(coalesce(p_public_note, '')),
      opening_hours = coalesce(p_opening_hours, '[]'::jsonb),
      is_active = coalesce(p_is_active, true)
  where id = p_branch_id;

  perform app.audit(v_branch.business_id, 'branch.updated', 'branch', p_branch_id,
    'Actualizó la sucursal ' || btrim(p_name),
    jsonb_build_object('is_active', coalesce(p_is_active, true), 'timezone', p_timezone), p_branch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipo e invitaciones
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_business_id uuid,
  p_email text,
  p_role text,
  p_can_publish boolean,
  p_all_branches boolean,
  p_branch_ids uuid[],
  p_expires_in_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.memberships;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := p_role;
  v_can_publish boolean := coalesce(p_can_publish, false);
  v_all boolean := coalesce(p_all_branches, false);
  v_branch_ids uuid[];
  v_plan public.plans;
  v_seats int;
  v_token text := app.random_token();
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  v_actor := app.require_permission(p_business_id, 'team.manage');
  perform app.require_active_business(p_business_id);

  if v_role not in ('owner', 'admin', 'editor') then
    perform app.fail(422, 'invalid_role');
  end if;
  if not app.can_grant_role(v_actor.role, v_role) then
    perform app.fail(403, 'role_not_grantable');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    perform app.fail(422, 'invalid_email');
  end if;
  if p_expires_in_days is null or p_expires_in_days not between 1 and 30 then
    perform app.fail(422, 'invalid_expiration');
  end if;

  if v_role in ('owner', 'admin') then
    v_can_publish := true;
    v_all := true;
  end if;
  v_branch_ids := app.normalize_branch_scope(p_business_id, v_role, v_all, p_branch_ids);

  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and m.status = 'active' and lower(u.email) = v_email
  ) then
    perform app.fail(409, 'already_member');
  end if;

  -- Reemplaza invitaciones abiertas previas para el mismo email.
  update public.invitations
  set revoked_at = now(), revoked_by = auth.uid()
  where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;

  v_plan := app.current_plan(p_business_id);
  select
    (select count(*) from public.memberships where business_id = p_business_id and status = 'active')
    + (select count(*) from public.invitations
       where business_id = p_business_id and accepted_at is null and revoked_at is null and expires_at > now())
  into v_seats;
  if v_seats >= v_plan.max_members then
    perform app.fail(422, 'plan_limit_members', v_plan.max_members::text);
  end if;

  v_expires_at := now() + make_interval(days => p_expires_in_days);
  insert into public.invitations (business_id, email, role, can_publish, all_branches, token_hash, expires_at, created_by)
  values (p_business_id, v_email, v_role, v_can_publish, v_all, app.sha256_hex(v_token), v_expires_at, auth.uid())
  returning id into v_invitation_id;

  insert into public.invitation_branches (business_id, invitation_id, branch_id)
  select p_business_id, v_invitation_id, b from unnest(v_branch_ids) b;

  perform app.audit(p_business_id, 'team.invited', 'invitation', v_invitation_id,
    'Invitó a ' || v_email || ' como ' || v_role,
    jsonb_build_object('email', v_email, 'role', v_role, 'can_publish', v_can_publish, 'all_branches', v_all,
                       'branch_ids', to_jsonb(v_branch_ids)));

  return jsonb_build_object('invitation_id', v_invitation_id, 'token', v_token, 'expires_at', v_expires_at);
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_actor public.memberships;
begin
  select * into v_invitation from public.invitations where id = p_invitation_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_actor := app.require_permission(v_invitation.business_id, 'team.manage');
  if not app.can_grant_role(v_actor.role, v_invitation.role) then
    perform app.fail(403, 'forbidden');
  end if;
  if v_invitation.accepted_at is not null then
    perform app.fail(409, 'invitation_already_accepted');
  end if;
  if v_invitation.revoked_at is not null then
    return;
  end if;
  update public.invitations set revoked_at = now(), revoked_by = auth.uid() where id = p_invitation_id;
  perform app.audit(v_invitation.business_id, 'team.invitation_revoked', 'invitation', p_invitation_id,
    'Revocó la invitación de ' || v_invitation.email, '{}'::jsonb);
end;
$$;

create or replace function app.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when position('@' in p_email) <= 1 then p_email
    else left(p_email, least(2, position('@' in p_email) - 1))
         || repeat('•', greatest(3, position('@' in p_email) - 3))
         || substr(p_email, position('@' in p_email))
  end;
$$;

-- Vista previa de una invitación (para la página /invitacion/<token>). Callable
-- por visitantes: el token tiene 256 bits y solo devuelve datos mínimos.
create or replace function public.get_invitation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_business public.businesses;
  v_inviter text;
  v_status text;
  v_user_email text;
begin
  if p_token is null or char_length(p_token) not between 20 and 100 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_invitation from public.invitations where token_hash = app.sha256_hex(p_token);
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_business from public.businesses where id = v_invitation.business_id;
  select nullif(full_name, '') into v_inviter from public.profiles where id = v_invitation.created_by;

  v_status := case
    when v_invitation.revoked_at is not null then 'revoked'
    when v_invitation.accepted_at is not null then 'accepted'
    when v_invitation.expires_at <= now() then 'expired'
    when v_business.status = 'suspended' then 'unavailable'
    else 'valid'
  end;

  if auth.uid() is not null then
    select lower(email) into v_user_email from auth.users where id = auth.uid();
  end if;

  return jsonb_build_object(
    'status', v_status,
    'business_name', v_business.name,
    'role', v_invitation.role,
    'email_hint', app.mask_email(v_invitation.email),
    'email_matches', v_user_email is not null and v_user_email = v_invitation.email,
    'invited_by', coalesce(v_inviter, case when v_invitation.created_by_platform then 'CartaLista' else null end),
    'expires_at', v_invitation.expires_at
  );
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_user_email text;
  v_confirmed timestamptz;
  v_invitation public.invitations;
  v_business public.businesses;
  v_membership public.memberships;
  v_membership_id uuid;
begin
  select lower(email), email_confirmed_at into v_user_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then
    perform app.fail(403, 'email_not_confirmed');
  end if;

  select * into v_invitation from public.invitations
  where token_hash = app.sha256_hex(coalesce(p_token, ''))
  for update;
  if not found then
    perform app.fail(404, 'invitation_invalid');
  end if;

  select * into v_business from public.businesses where id = v_invitation.business_id;

  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_uid then
      return jsonb_build_object('business_id', v_business.id, 'business_slug', v_business.slug, 'already', true);
    end if;
    perform app.fail(410, 'invitation_used');
  end if;
  if v_invitation.revoked_at is not null then
    perform app.fail(410, 'invitation_revoked');
  end if;
  if v_invitation.expires_at <= now() then
    perform app.fail(410, 'invitation_expired');
  end if;
  if v_user_email is distinct from v_invitation.email then
    perform app.fail(403, 'invitation_email_mismatch');
  end if;
  if v_business.status = 'suspended' then
    perform app.fail(403, 'business_suspended');
  end if;

  select * into v_membership from public.memberships
  where business_id = v_invitation.business_id and user_id = v_uid
  for update;

  if found then
    if v_membership.status = 'active' then
      perform app.fail(409, 'already_member');
    end if;
    update public.memberships
    set role = v_invitation.role,
        can_publish = v_invitation.can_publish,
        all_branches = v_invitation.all_branches,
        status = 'active',
        revoked_at = null,
        revoked_by = null,
        created_by = v_invitation.created_by
    where id = v_membership.id;
    v_membership_id := v_membership.id;
    delete from public.membership_branches where membership_id = v_membership_id;
  else
    insert into public.memberships (business_id, user_id, role, can_publish, all_branches, created_by)
    values (v_invitation.business_id, v_uid, v_invitation.role, v_invitation.can_publish, v_invitation.all_branches,
            v_invitation.created_by)
    returning id into v_membership_id;
  end if;

  insert into public.membership_branches (business_id, membership_id, branch_id)
  select v_invitation.business_id, v_membership_id, ib.branch_id
  from public.invitation_branches ib
  where ib.invitation_id = v_invitation.id;

  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_invitation.id;

  perform app.audit(v_invitation.business_id, 'team.joined', 'membership', v_membership_id,
    v_user_email || ' aceptó la invitación como ' || v_invitation.role,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role));

  return jsonb_build_object('business_id', v_business.id, 'business_slug', v_business.slug, 'already', false);
end;
$$;

-- Aceptar desde el panel una invitación dirigida al email verificado del usuario.
-- Equivale a usar el enlace: la invitación sigue atada al destinatario.
create or replace function public.accept_invitation_by_id(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := app.require_user();
  v_user_email text;
  v_confirmed timestamptz;
  v_invitation public.invitations;
  v_business public.businesses;
  v_membership public.memberships;
  v_membership_id uuid;
begin
  select lower(email), email_confirmed_at into v_user_email, v_confirmed from auth.users where id = v_uid;
  if v_confirmed is null then
    perform app.fail(403, 'email_not_confirmed');
  end if;
  select * into v_invitation from public.invitations where id = p_invitation_id for update;
  if not found or v_invitation.email is distinct from v_user_email then
    perform app.fail(404, 'invitation_invalid');
  end if;
  if v_invitation.accepted_at is not null then
    perform app.fail(410, 'invitation_used');
  end if;
  if v_invitation.revoked_at is not null then
    perform app.fail(410, 'invitation_revoked');
  end if;
  if v_invitation.expires_at <= now() then
    perform app.fail(410, 'invitation_expired');
  end if;
  select * into v_business from public.businesses where id = v_invitation.business_id;
  if v_business.status = 'suspended' then
    perform app.fail(403, 'business_suspended');
  end if;

  select * into v_membership from public.memberships
  where business_id = v_invitation.business_id and user_id = v_uid for update;
  if found then
    if v_membership.status = 'active' then
      perform app.fail(409, 'already_member');
    end if;
    update public.memberships
    set role = v_invitation.role, can_publish = v_invitation.can_publish, all_branches = v_invitation.all_branches,
        status = 'active', revoked_at = null, revoked_by = null, created_by = v_invitation.created_by
    where id = v_membership.id;
    v_membership_id := v_membership.id;
    delete from public.membership_branches where membership_id = v_membership_id;
  else
    insert into public.memberships (business_id, user_id, role, can_publish, all_branches, created_by)
    values (v_invitation.business_id, v_uid, v_invitation.role, v_invitation.can_publish, v_invitation.all_branches,
            v_invitation.created_by)
    returning id into v_membership_id;
  end if;
  insert into public.membership_branches (business_id, membership_id, branch_id)
  select v_invitation.business_id, v_membership_id, ib.branch_id
  from public.invitation_branches ib where ib.invitation_id = v_invitation.id;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_invitation.id;
  perform app.audit(v_invitation.business_id, 'team.joined', 'membership', v_membership_id,
    v_user_email || ' aceptó la invitación como ' || v_invitation.role,
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role));
  return jsonb_build_object('business_id', v_business.id, 'business_slug', v_business.slug, 'already', false);
end;
$$;

-- Invitaciones abiertas dirigidas al email verificado del usuario actual.
create or replace function public.my_pending_invitations()
returns table (invitation_id uuid, business_name text, role text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, b.name, i.role, i.expires_at
  from public.invitations i
  join public.businesses b on b.id = i.business_id
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null
    and i.email = lower(u.email)
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    and b.status = 'active'
  order by i.created_at desc;
$$;

create or replace function public.update_membership(
  p_membership_id uuid,
  p_role text,
  p_can_publish boolean,
  p_all_branches boolean,
  p_branch_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.memberships;
  v_actor public.memberships;
  v_role text := p_role;
  v_can_publish boolean := coalesce(p_can_publish, false);
  v_all boolean := coalesce(p_all_branches, false);
  v_branch_ids uuid[];
  v_owners int;
begin
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_actor := app.require_permission(v_target.business_id, 'team.manage');
  perform app.require_active_business(v_target.business_id);

  if v_target.user_id = auth.uid() then
    perform app.fail(403, 'cannot_modify_self');
  end if;
  if v_target.status <> 'active' then
    perform app.fail(409, 'membership_revoked');
  end if;
  if not app.can_grant_role(v_actor.role, v_target.role) then
    perform app.fail(403, 'forbidden');
  end if;
  if v_role not in ('owner', 'admin', 'editor') then
    perform app.fail(422, 'invalid_role');
  end if;
  if not app.can_grant_role(v_actor.role, v_role) then
    perform app.fail(403, 'role_not_grantable');
  end if;
  if v_target.role = 'owner' and v_role <> 'owner' then
    select count(*) into v_owners from public.memberships
    where business_id = v_target.business_id and role = 'owner' and status = 'active';
    if v_owners <= 1 then
      perform app.fail(409, 'last_owner');
    end if;
  end if;

  if v_role in ('owner', 'admin') then
    v_can_publish := true;
    v_all := true;
  end if;
  v_branch_ids := app.normalize_branch_scope(v_target.business_id, v_role, v_all, p_branch_ids);

  update public.memberships
  set role = v_role, can_publish = v_can_publish, all_branches = v_all
  where id = p_membership_id;

  delete from public.membership_branches where membership_id = p_membership_id;
  insert into public.membership_branches (business_id, membership_id, branch_id)
  select v_target.business_id, p_membership_id, b from unnest(v_branch_ids) b;

  perform app.audit(v_target.business_id, 'team.updated', 'membership', p_membership_id,
    'Actualizó el rol y el alcance de un miembro',
    jsonb_build_object(
      'before', jsonb_build_object('role', v_target.role, 'can_publish', v_target.can_publish, 'all_branches', v_target.all_branches),
      'after', jsonb_build_object('role', v_role, 'can_publish', v_can_publish, 'all_branches', v_all, 'branch_ids', to_jsonb(v_branch_ids))
    ));
end;
$$;

create or replace function public.revoke_membership(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.memberships;
  v_actor public.memberships;
  v_owners int;
begin
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_actor := app.require_permission(v_target.business_id, 'team.manage');

  if v_target.user_id = auth.uid() then
    perform app.fail(403, 'cannot_modify_self');
  end if;
  if v_target.status <> 'active' then
    return;
  end if;
  if not app.can_grant_role(v_actor.role, v_target.role) then
    perform app.fail(403, 'forbidden');
  end if;
  if v_target.role = 'owner' then
    select count(*) into v_owners from public.memberships
    where business_id = v_target.business_id and role = 'owner' and status = 'active';
    if v_owners <= 1 then
      perform app.fail(409, 'last_owner');
    end if;
  end if;

  update public.memberships
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where id = p_membership_id;
  delete from public.membership_branches where membership_id = p_membership_id;

  perform app.audit(v_target.business_id, 'team.revoked', 'membership', p_membership_id,
    'Revocó el acceso de un miembro', jsonb_build_object('role', v_target.role, 'user_id', v_target.user_id));
end;
$$;
