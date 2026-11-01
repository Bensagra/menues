-- CartaLista · RPC de servidor y administración de plataforma
--
-- Estas funciones solo las ejecuta service role (el servidor de Next.js, el
-- worker o los scripts). Reciben el actor explícito porque se llaman después de
-- que el servidor verificó la sesión, y vuelven a validar sus permisos.
-- No existe suplantación de usuarios: el administrador actúa con su identidad.

create or replace function app.require_platform_admin(p_actor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (select 1 from public.platform_admins where user_id = p_actor_id) then
    perform app.fail(403, 'forbidden');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Medios procesados por el servidor
-- ---------------------------------------------------------------------------
create or replace function public.server_create_media(
  p_actor_id uuid,
  p_business_id uuid,
  p_kind text,
  p_path_sm text,
  p_path_lg text,
  p_width int,
  p_height int,
  p_bytes int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships;
  v_id uuid;
begin
  select * into v_membership from public.memberships
  where business_id = p_business_id and user_id = p_actor_id and status = 'active';
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  if p_kind = 'product_image' then
    if not app.role_permits(v_membership.role, v_membership.can_publish, 'catalog.edit') then
      perform app.fail(403, 'forbidden');
    end if;
  elsif p_kind in ('logo', 'cover') then
    if not app.role_permits(v_membership.role, v_membership.can_publish, 'business.update') then
      perform app.fail(403, 'forbidden');
    end if;
  else
    perform app.fail(422, 'invalid_kind');
  end if;
  if (select status from public.businesses where id = p_business_id) <> 'active' then
    perform app.fail(403, 'business_suspended');
  end if;
  if p_path_lg not like p_business_id::text || '/%' or p_path_sm not like p_business_id::text || '/%' then
    perform app.fail(422, 'invalid_path');
  end if;
  insert into public.media (business_id, kind, path_sm, path_lg, width, height, bytes, created_by)
  values (p_business_id, p_kind, p_path_sm, p_path_lg, p_width, p_height, p_bytes, p_actor_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administradores de plataforma (solo desde el script de línea de comandos)
-- ---------------------------------------------------------------------------
create or replace function public.server_grant_platform_admin(p_email text, p_granted_by text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users;
begin
  select * into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if not found then
    perform app.fail(404, 'user_not_found');
  end if;
  if v_user.email_confirmed_at is null then
    perform app.fail(403, 'email_not_confirmed');
  end if;
  insert into public.platform_admins (user_id, granted_by, note)
  values (v_user.id, left(p_granted_by, 200), left(coalesce(p_note, ''), 300))
  on conflict (user_id) do nothing;
  perform app.audit(null, 'platform.admin_granted', 'user', v_user.id,
    'Se otorgó acceso de administrador de plataforma a ' || v_user.email,
    jsonb_build_object('granted_by', p_granted_by), null, null, 'system');
  return jsonb_build_object('user_id', v_user.id, 'email', v_user.email);
end;
$$;

create or replace function public.server_revoke_platform_admin(p_email text, p_revoked_by text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_user_id is null then
    return false;
  end if;
  delete from public.platform_admins where user_id = v_user_id;
  if found then
    perform app.audit(null, 'platform.admin_revoked', 'user', v_user_id,
      'Se revocó el acceso de administrador de plataforma', jsonb_build_object('revoked_by', p_revoked_by), null, null, 'system');
  end if;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Negocios (alta por plataforma con invitación al propietario)
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_business(
  p_actor_id uuid,
  p_name text,
  p_slug text,
  p_currency text,
  p_branch_name text,
  p_branch_slug text,
  p_timezone text,
  p_owner_email text,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_branch_id uuid;
  v_menu_id uuid;
  v_token text := app.random_token();
  v_invitation_id uuid;
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_constraint text;
begin
  perform app.require_platform_admin(p_actor_id);
  if not app.is_valid_slug(p_slug) or not app.is_valid_slug(p_branch_slug) then
    perform app.fail(422, 'invalid_slug');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail(422, 'invalid_email');
  end if;
  if p_plan_id is not null and not exists (select 1 from public.plans where id = p_plan_id and is_active) then
    perform app.fail(422, 'invalid_plan');
  end if;

  insert into public.businesses (name, slug, currency, created_by)
  values (btrim(p_name), p_slug, upper(coalesce(p_currency, 'ARS')), p_actor_id)
  returning id into v_business_id;
  insert into public.branches (business_id, name, public_slug, timezone, created_by)
  values (v_business_id, btrim(p_branch_name), p_branch_slug, p_timezone, p_actor_id)
  returning id into v_branch_id;
  insert into public.plan_assignments (business_id, plan_id, assigned_by, note)
  values (v_business_id, coalesce(p_plan_id, (select id from public.plans where is_default)), p_actor_id, 'Asignado al crear el negocio');
  insert into public.menus (business_id, name, created_by) values (v_business_id, 'Carta', p_actor_id) returning id into v_menu_id;
  insert into public.menu_branches (business_id, menu_id, branch_id) values (v_business_id, v_menu_id, v_branch_id);

  insert into public.invitations (business_id, email, role, can_publish, all_branches, token_hash, expires_at, created_by, created_by_platform)
  values (v_business_id, v_email, 'owner', true, true, app.sha256_hex(v_token), now() + interval '14 days', p_actor_id, true)
  returning id into v_invitation_id;

  perform app.audit(v_business_id, 'platform.business_created', 'business', v_business_id,
    'La plataforma creó el negocio ' || btrim(p_name) || ' e invitó a ' || v_email,
    jsonb_build_object('owner_email', v_email), null, p_actor_id, 'platform_admin');

  return jsonb_build_object('business_id', v_business_id, 'branch_id', v_branch_id, 'invitation_id', v_invitation_id,
                            'token', v_token);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform app.fail(409, app.unique_violation_code(v_constraint));
end;
$$;

create or replace function public.admin_invite_owner(p_actor_id uuid, p_business_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := app.random_token();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  perform app.require_platform_admin(p_actor_id);
  if not exists (select 1 from public.businesses where id = p_business_id) then
    perform app.fail(404, 'not_found');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail(422, 'invalid_email');
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id and m.status = 'active' and lower(u.email) = v_email
  ) then
    perform app.fail(409, 'already_member');
  end if;
  update public.invitations set revoked_at = now(), revoked_by = p_actor_id
  where business_id = p_business_id and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (business_id, email, role, can_publish, all_branches, token_hash, expires_at, created_by, created_by_platform)
  values (p_business_id, v_email, 'owner', true, true, app.sha256_hex(v_token), now() + interval '14 days', p_actor_id, true)
  returning id into v_id;
  perform app.audit(p_business_id, 'platform.owner_invited', 'invitation', v_id,
    'La plataforma invitó a ' || v_email || ' como propietario', '{}'::jsonb, null, p_actor_id, 'platform_admin');
  return jsonb_build_object('invitation_id', v_id, 'token', v_token);
end;
$$;

-- Impacto de suspender una cuenta (se muestra antes de confirmar).
create or replace function public.admin_business_impact(p_actor_id uuid, p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin(p_actor_id);
  return jsonb_build_object(
    'public_branches', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.name, 'public_slug', b.public_slug,
        'published', exists (select 1 from public.menu_branches mb where mb.branch_id = b.id and mb.published_version_id is not null))
        order by b.sort_order, b.name)
      from public.branches b where b.business_id = p_business_id and b.is_active
    ), '[]'::jsonb),
    'members', (select count(*) from public.memberships where business_id = p_business_id and status = 'active'),
    'queued_imports', (select count(*) from public.imports where business_id = p_business_id and status in ('pending', 'processing')),
    'reviews_pending', (select count(*) from public.imports where business_id = p_business_id and status = 'needs_review')
  );
end;
$$;

-- Suspender: la carta pública muestra "no disponible", el equipo queda en solo
-- lectura y las importaciones en cola esperan. Reactivar restablece todo.
create or replace function public.admin_set_business_status(
  p_actor_id uuid,
  p_business_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
begin
  perform app.require_platform_admin(p_actor_id);
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  if p_status not in ('active', 'suspended') then
    perform app.fail(422, 'invalid_status');
  end if;
  if p_status = 'suspended' and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform app.fail(422, 'reason_required');
  end if;
  if v_business.status <> p_status then
    update public.businesses
    set status = p_status,
        suspended_at = case when p_status = 'suspended' then now() else null end,
        suspended_by = case when p_status = 'suspended' then p_actor_id else null end,
        suspended_reason = case when p_status = 'suspended' then left(btrim(p_reason), 300) else null end
    where id = p_business_id;
    perform app.audit(p_business_id,
      case when p_status = 'suspended' then 'platform.business_suspended' else 'platform.business_activated' end,
      'business', p_business_id,
      case when p_status = 'suspended' then 'Suspendió la cuenta: ' || left(btrim(p_reason), 200) else 'Reactivó la cuenta' end,
      '{}'::jsonb, null, p_actor_id, 'platform_admin');
  end if;
  return jsonb_build_object(
    'status', p_status,
    'branch_slugs', (select coalesce(jsonb_agg(public_slug), '[]'::jsonb) from public.branches where business_id = p_business_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Planes
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_plan(p_actor_id uuid, p_business_id uuid, p_plan_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  perform app.require_platform_admin(p_actor_id);
  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    perform app.fail(422, 'invalid_plan');
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    perform app.fail(404, 'not_found');
  end if;
  perform 1 from public.businesses where id = p_business_id for update;
  if exists (select 1 from public.plan_assignments where business_id = p_business_id and ends_at is null and plan_id = p_plan_id) then
    return;
  end if;
  update public.plan_assignments set ends_at = now() where business_id = p_business_id and ends_at is null;
  insert into public.plan_assignments (business_id, plan_id, assigned_by, note)
  values (p_business_id, p_plan_id, p_actor_id, left(btrim(coalesce(p_note, '')), 300));
  perform app.audit(p_business_id, 'platform.plan_assigned', 'plan', p_plan_id, 'Asignó el plan ' || v_plan.name,
    jsonb_build_object('note', p_note), null, p_actor_id, 'platform_admin');
end;
$$;

create or replace function public.admin_save_plan(p_actor_id uuid, p_plan jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_plan ->> 'id', '')::uuid;
begin
  perform app.require_platform_admin(p_actor_id);
  if v_id is null then
    insert into public.plans (code, name, description, max_branches, max_members, max_menus, ai_pages_per_month, ai_max_pages_per_import, is_active)
    values (
      p_plan ->> 'code', btrim(p_plan ->> 'name'), btrim(coalesce(p_plan ->> 'description', '')),
      (p_plan ->> 'max_branches')::int, (p_plan ->> 'max_members')::int, (p_plan ->> 'max_menus')::int,
      (p_plan ->> 'ai_pages_per_month')::int, (p_plan ->> 'ai_max_pages_per_import')::int,
      coalesce((p_plan ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.plans
    set name = btrim(p_plan ->> 'name'),
        description = btrim(coalesce(p_plan ->> 'description', '')),
        max_branches = (p_plan ->> 'max_branches')::int,
        max_members = (p_plan ->> 'max_members')::int,
        max_menus = (p_plan ->> 'max_menus')::int,
        ai_pages_per_month = (p_plan ->> 'ai_pages_per_month')::int,
        ai_max_pages_per_import = (p_plan ->> 'ai_max_pages_per_import')::int,
        is_active = case when is_default then true else coalesce((p_plan ->> 'is_active')::boolean, is_active) end
    where id = v_id;
    if not found then
      perform app.fail(404, 'not_found');
    end if;
  end if;
  perform app.audit(null, 'platform.plan_saved', 'plan', v_id, 'Guardó el plan ' || btrim(p_plan ->> 'name'),
    p_plan, null, p_actor_id, 'platform_admin');
  return v_id;
exception
  when unique_violation then
    perform app.fail(409, 'plan_code_taken');
  when check_violation then
    perform app.fail(422, 'invalid_plan');
end;
$$;

-- ---------------------------------------------------------------------------
-- Procesamientos
-- ---------------------------------------------------------------------------
create or replace function public.admin_retry_import(p_actor_id uuid, p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
begin
  perform app.require_platform_admin(p_actor_id);
  select * into v_import from public.imports where id = p_import_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  return app.requeue_import(v_import, p_actor_id, 'platform_admin');
end;
$$;
