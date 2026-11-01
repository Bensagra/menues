-- CartaLista · Funciones públicas y de estado

-- ---------------------------------------------------------------------------
-- Menú público por sucursal. Devuelve SOLO versiones publicadas y datos
-- públicos del local. Es la única vía de lectura para visitantes.
--
-- Cuenta suspendida o sucursal inactiva: status 'unavailable', sin carta.
-- ---------------------------------------------------------------------------
create or replace function app.public_media(p_media_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('sm', path_sm, 'lg', path_lg, 'w', width, 'h', height)
  from public.media where id = p_media_id;
$$;

create or replace function public.get_public_menu(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_business public.businesses;
  v_menus jsonb;
  v_business_json jsonb;
  v_branch_json jsonb;
begin
  if not app.is_valid_slug(coalesce(p_slug, '')) then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_branch from public.branches where public_slug = p_slug;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_business from public.businesses where id = v_branch.business_id;

  if v_business.status = 'suspended' or not v_branch.is_active then
    return jsonb_build_object(
      'status', 'unavailable',
      'business', jsonb_build_object('name', v_business.name),
      'branch', jsonb_build_object('name', v_branch.name)
    );
  end if;

  v_business_json := jsonb_build_object(
    'id', v_business.id,
    'name', v_business.name,
    'description', v_business.description,
    'brand_color', v_business.brand_color,
    'currency', v_business.currency,
    'locale', v_business.locale,
    'logo', app.public_media(v_business.logo_media_id),
    'cover', app.public_media(v_business.cover_media_id)
  );
  v_branch_json := jsonb_build_object(
    'id', v_branch.id,
    'name', v_branch.name,
    'public_slug', v_branch.public_slug,
    'address', v_branch.address,
    'phone', v_branch.phone,
    'whatsapp', v_branch.whatsapp,
    'public_note', v_branch.public_note,
    'timezone', v_branch.timezone,
    'opening_hours', v_branch.opening_hours,
    'other_branches', coalesce((
      select jsonb_agg(jsonb_build_object('name', b.name, 'public_slug', b.public_slug) order by b.sort_order, b.name)
      from public.branches b
      where b.business_id = v_business.id and b.id <> v_branch.id and b.is_active
    ), '[]'::jsonb)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'menu_id', m.id,
      'kind', m.kind,
      'version_id', v.id,
      'version_number', v.version_number,
      'published_at', v.created_at,
      'snapshot', v.snapshot
    ) order by mb.sort_order, m.sort_order, m.name), '[]'::jsonb)
  into v_menus
  from public.menu_branches mb
  join public.menus m on m.id = mb.menu_id and m.status = 'active'
  join public.menu_versions v on v.id = mb.published_version_id
  where mb.branch_id = v_branch.id;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_menus) = 0 then 'unpublished' else 'ok' end,
    'business', v_business_json,
    'branch', v_branch_json,
    'menus', v_menus
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Estado del procesador de fotos (para mostrar avisos honestos en la UI).
-- ---------------------------------------------------------------------------
create or replace function public.get_processing_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'worker_online', exists (select 1 from public.worker_heartbeats where last_seen_at > now() - interval '90 seconds'),
    'ai_configured', coalesce((
      select bool_or(ai_configured) from public.worker_heartbeats where last_seen_at > now() - interval '90 seconds'
    ), false),
    'provider', (select provider from public.worker_heartbeats where last_seen_at > now() - interval '90 seconds'
                 order by last_seen_at desc limit 1),
    'last_seen_at', (select max(last_seen_at) from public.worker_heartbeats)
  )
  where auth.uid() is not null;
$$;

-- Cuota de IA del mes para un negocio (cualquier miembro).
create or replace function public.get_ai_quota(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_usage public.ai_usage_months;
begin
  perform app.require_member(p_business_id);
  v_plan := app.current_plan(p_business_id);
  select * into v_usage from public.ai_usage_months where business_id = p_business_id and month = app.current_month();
  return jsonb_build_object(
    'month', app.current_month(),
    'plan_code', v_plan.code,
    'plan_name', v_plan.name,
    'limit', v_plan.ai_pages_per_month,
    'used', coalesce(v_usage.pages_used, 0),
    'reserved', coalesce(v_usage.pages_reserved, 0),
    'remaining', greatest(0, v_plan.ai_pages_per_month - coalesce(v_usage.pages_used, 0) - coalesce(v_usage.pages_reserved, 0)),
    'max_pages_per_import', v_plan.ai_max_pages_per_import
  );
end;
$$;

-- Límites del plan y uso actual (pantalla Plan).
create or replace function public.get_plan_overview(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  perform app.require_permission(p_business_id, 'plan.view');
  v_plan := app.current_plan(p_business_id);
  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'assigned_at', (select starts_at from public.plan_assignments where business_id = p_business_id and ends_at is null),
    'branches', (select count(*) from public.branches where business_id = p_business_id),
    'members', (select count(*) from public.memberships where business_id = p_business_id and status = 'active'),
    'open_invitations', (select count(*) from public.invitations where business_id = p_business_id
                         and accepted_at is null and revoked_at is null and expires_at > now()),
    'menus', (select count(*) from public.menus where business_id = p_business_id and status = 'active'),
    'ai', public.get_ai_quota(p_business_id)
  );
end;
$$;
