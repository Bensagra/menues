-- CartaLista · Diseño de la carta a medida
--
-- El diseño (paleta, tipografías y estilo) se guarda en businesses.theme y se
-- muestra en todas las cartas públicas del local. Se elige de listas cerradas
-- y la paleta siempre cumple contraste AA (app.is_valid_theme repite la regla
-- de src/domain/theme.ts): ni la IA ni un ajuste a mano pueden dejar la carta
-- ilegible ni inyectar estilos.
--
-- Las propuestas las arma el worker con IA (design_requests es su cola) a
-- partir de lo que el local ya tiene: logo, foto de portada, la foto de su
-- carta y su sitio web. La IA no recibe herramientas ni escribe en la base:
-- devuelve una propuesta que el dueño ve en una vista previa y aplica si quiere.

-- ---------------------------------------------------------------------------
-- 1. Validación del diseño
-- ---------------------------------------------------------------------------
create or replace function app.is_valid_theme(p_theme jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_colors jsonb := p_theme -> 'colors';
  v_fonts jsonb := p_theme -> 'fonts';
  v_style jsonb := p_theme -> 'style';
  v_key text;
  v_on text;
begin
  if jsonb_typeof(p_theme) is distinct from 'object'
     or jsonb_typeof(v_colors) is distinct from 'object'
     or jsonb_typeof(v_fonts) is distinct from 'object'
     or jsonb_typeof(v_style) is distinct from 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_theme)) <> 3
     or (select count(*) from jsonb_object_keys(v_colors)) <> 5
     or (select count(*) from jsonb_object_keys(v_fonts)) <> 2
     or (select count(*) from jsonb_object_keys(v_style)) <> 4 then
    return false;
  end if;
  foreach v_key in array array['background', 'surface', 'text', 'muted', 'accent'] loop
    if coalesce(v_colors ->> v_key, '') !~ '^#[0-9A-F]{6}$' then
      return false;
    end if;
  end loop;
  if coalesce(v_fonts ->> 'display', '') not in (
       'fraunces', 'playfair', 'dm_serif', 'cormorant', 'libre_baskerville', 'bebas', 'oswald',
       'archivo_black', 'josefin', 'space_grotesk', 'caveat', 'pacifico', 'manrope')
     or coalesce(v_fonts ->> 'body', '') not in ('manrope', 'dm_sans', 'work_sans', 'lora')
     or coalesce(v_style ->> 'header', '') not in ('classic', 'centered')
     or coalesce(v_style ->> 'categories', '') not in ('plain', 'caps', 'underline', 'band')
     or coalesce(v_style ->> 'dividers', '') not in ('dashed', 'dotted', 'solid', 'none')
     or coalesce(v_style ->> 'corners', '') not in ('square', 'soft', 'round') then
    return false;
  end if;
  -- Texto, texto secundario y color de marca deben leerse sobre el fondo y sobre las tarjetas.
  foreach v_key in array array['text', 'muted', 'accent'] loop
    foreach v_on in array array['background', 'surface'] loop
      if app.contrast_ratio(v_colors ->> v_key, v_colors ->> v_on) < 4.5 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.businesses
  add column theme jsonb check (theme is null or app.is_valid_theme(theme)),
  add column website_url text check (
    website_url is null or (char_length(website_url) <= 300 and website_url ~ '^https?://[^\s/?#]+\.[^\s]*$')
  );

-- ---------------------------------------------------------------------------
-- 2. Propuestas de diseño (cola del worker)
-- ---------------------------------------------------------------------------
create table public.design_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  origin text not null check (origin in ('manual', 'import')),
  -- Importación cuya foto se usa como referencia de la carta impresa (si hay).
  import_id uuid,
  website_url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'applied')),
  attempts int not null default 0,
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  lock_token uuid,
  theme jsonb check (theme is null or app.is_valid_theme(theme)),
  summary text not null default '' check (char_length(summary) <= 600),
  -- Referencias que se usaron: logo, cover, menu_photo, website.
  sources text[] not null default '{}',
  provider text,
  model text,
  error_code text,
  error_message text,
  completed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, import_id) references public.imports (business_id, id) on delete set null (import_id),
  check (status <> 'ready' or theme is not null)
);

create index design_requests_business on public.design_requests (business_id, created_at desc);
create index design_requests_queue on public.design_requests (next_attempt_at) where status = 'pending';

create trigger design_requests_touch before update on public.design_requests
  for each row execute function app.touch_updated_at();

alter table public.design_requests enable row level security;

create policy design_requests_select on public.design_requests for select to authenticated
  using (app.has_permission(business_id, 'business.update'));

-- ---------------------------------------------------------------------------
-- 3. Acciones del local
-- ---------------------------------------------------------------------------
create or replace function app.normalize_website(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_url, '')), '');
$$;

create or replace function public.set_business_website(p_business_id uuid, p_website_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := app.normalize_website(p_website_url);
begin
  perform app.require_permission(p_business_id, 'business.update');
  perform app.require_active_business(p_business_id);
  if v_url is not null and (char_length(v_url) > 300 or v_url !~ '^https?://[^\s/?#]+\.[^\s]*$') then
    perform app.fail(422, 'invalid_website');
  end if;
  update public.businesses set website_url = v_url where id = p_business_id and website_url is distinct from v_url;
  if found then
    perform app.audit(p_business_id, 'business.website_updated', 'business', p_business_id,
      'Actualizó el sitio web del local', jsonb_build_object('website_url', v_url));
  end if;
end;
$$;

-- Última importación con fotos del local (referencia de la carta impresa).
create or replace function app.latest_import_with_photos(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
  from public.imports i
  where i.business_id = p_business_id
    and i.status in ('needs_review', 'completed')
    and exists (select 1 from public.import_images m where m.import_id = i.id and m.status in ('ready', 'extracted'))
  order by i.created_at desc
  limit 1;
$$;

-- Pide una propuesta nueva. Si ya hay una en curso la devuelve (no duplica) y
-- limita a 10 propuestas por día por local (cada una usa la cuota de la IA).
create or replace function public.request_menu_design(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_existing public.design_requests;
  v_id uuid;
begin
  perform app.require_permission(p_business_id, 'business.update');
  v_business := app.require_active_business(p_business_id);
  -- Serializa los pedidos del mismo local (doble clic, dos pestañas).
  perform 1 from public.businesses where id = p_business_id for update;

  select * into v_existing from public.design_requests
  where business_id = p_business_id and status in ('pending', 'processing')
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'replayed', true);
  end if;

  if (select count(*) from public.design_requests
      where business_id = p_business_id and created_at > now() - interval '1 day') >= 10 then
    perform app.fail(429, 'design_limit_reached');
  end if;

  insert into public.design_requests (business_id, requested_by, origin, import_id, website_url)
  values (p_business_id, auth.uid(), 'manual', app.latest_import_with_photos(p_business_id), v_business.website_url)
  returning id into v_id;

  perform app.audit(p_business_id, 'design.requested', 'design_request', v_id, 'Pidió una propuesta de diseño para la carta');
  return jsonb_build_object('id', v_id, 'status', 'pending', 'replayed', false);
end;
$$;

-- Guarda el diseño elegido a mano (null vuelve al diseño estándar).
create or replace function public.set_menu_theme(p_business_id uuid, p_theme jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accent text := p_theme #>> '{colors,accent}';
begin
  perform app.require_permission(p_business_id, 'business.update');
  perform app.require_active_business(p_business_id);
  if p_theme is not null and not app.is_valid_theme(p_theme) then
    perform app.fail(422, 'theme_not_legible');
  end if;
  update public.businesses
  set theme = p_theme,
      -- El QR y la versión impresa usan el color de marca: se mantiene en sintonía si es legible ahí.
      brand_color = case when p_theme is not null and app.is_legible_brand_color(v_accent) then v_accent else brand_color end
  where id = p_business_id;
  perform app.audit(p_business_id, 'design.updated', 'business', p_business_id,
    case when p_theme is null then 'Volvió al diseño estándar de la carta' else 'Actualizó el diseño de la carta' end,
    jsonb_build_object('theme', p_theme));
end;
$$;

-- Aplica una propuesta lista a la carta del local.
create or replace function public.apply_menu_design(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.design_requests;
  v_accent text;
begin
  select * into v_request from public.design_requests where id = p_request_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_request.business_id, 'business.update');
  perform app.require_active_business(v_request.business_id);
  if v_request.status not in ('ready', 'applied') then
    perform app.fail(409, 'design_not_ready');
  end if;

  v_accent := v_request.theme #>> '{colors,accent}';
  update public.businesses
  set theme = v_request.theme,
      brand_color = case when app.is_legible_brand_color(v_accent) then v_accent else brand_color end
  where id = v_request.business_id;
  update public.design_requests set status = 'applied', applied_at = now() where id = p_request_id;

  perform app.audit(v_request.business_id, 'design.applied', 'design_request', p_request_id,
    'Aplicó una propuesta de diseño a la carta', jsonb_build_object('theme', v_request.theme));
  return v_request.business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Protocolo del worker (solo service role)
-- ---------------------------------------------------------------------------

-- Después de la primera importación con fotos, el worker propone un diseño por
-- su cuenta (una sola vez: si el local ya tiene diseño o ya pidió alguno, no).
create or replace function public.worker_request_design_from_import(p_import_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_business public.businesses;
  v_id uuid;
begin
  select * into v_import from public.imports where id = p_import_id;
  if not found then
    return null;
  end if;
  select * into v_business from public.businesses where id = v_import.business_id for update;
  if v_business.status <> 'active' or v_business.theme is not null
     or exists (select 1 from public.design_requests where business_id = v_business.id) then
    return null;
  end if;
  insert into public.design_requests (business_id, requested_by, origin, import_id, website_url)
  values (v_business.id, v_import.created_by, 'import', p_import_id, v_business.website_url)
  returning id into v_id;
  perform app.audit(v_business.id, 'design.requested', 'design_request', v_id,
    'Se pidió una propuesta de diseño a partir de la foto de la carta', '{}'::jsonb, null, null, 'worker');
  return v_id;
end;
$$;

create or replace function public.worker_claim_design(p_worker_id text, p_lease_seconds int default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_request public.design_requests;
begin
  -- Recupera propuestas cuyo worker dejó de responder.
  update public.design_requests
  set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
      next_attempt_at = now() + make_interval(secs => app.retry_delay_seconds(attempts)),
      lock_token = null, locked_by = null, locked_until = null,
      error_code = 'interrupted',
      error_message = 'El procesamiento se interrumpió.'
  where status = 'processing' and locked_until < now();

  select r.id into v_id
  from public.design_requests r
  where r.status = 'pending'
    and r.next_attempt_at <= now()
    and exists (select 1 from public.businesses b where b.id = r.business_id and b.status = 'active')
  order by r.next_attempt_at, r.created_at
  for update skip locked
  limit 1;
  if v_id is null then
    return null;
  end if;

  update public.design_requests
  set status = 'processing',
      attempts = attempts + 1,
      locked_by = left(p_worker_id, 120),
      locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
      lock_token = gen_random_uuid()
  where id = v_id
  returning * into v_request;
  return to_jsonb(v_request);
end;
$$;

create or replace function app.worker_design_lock(p_request_id uuid, p_lock_token uuid)
returns public.design_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.design_requests;
begin
  select * into v_request from public.design_requests where id = p_request_id for update;
  if not found or v_request.status <> 'processing' or v_request.lock_token is distinct from p_lock_token then
    perform app.fail(409, 'lease_lost');
  end if;
  return v_request;
end;
$$;

create or replace function public.worker_complete_design(
  p_request_id uuid,
  p_lock_token uuid,
  p_theme jsonb,
  p_summary text,
  p_sources text[],
  p_provider text,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.design_requests;
begin
  v_request := app.worker_design_lock(p_request_id, p_lock_token);
  if not app.is_valid_theme(p_theme) then
    perform app.fail(422, 'theme_not_legible');
  end if;
  update public.design_requests
  set status = 'ready',
      theme = p_theme,
      summary = left(btrim(coalesce(p_summary, '')), 600),
      sources = coalesce(p_sources, '{}'),
      provider = left(p_provider, 40),
      model = left(p_model, 120),
      error_code = null,
      error_message = null,
      completed_at = now(),
      lock_token = null, locked_by = null, locked_until = null
  where id = p_request_id;
  perform app.audit(v_request.business_id, 'design.ready', 'design_request', p_request_id,
    'La propuesta de diseño está lista', '{}'::jsonb, null, null, 'worker');
end;
$$;

create or replace function public.worker_fail_design(
  p_request_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_retry_after_seconds int default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.design_requests;
  v_retry boolean;
begin
  v_request := app.worker_design_lock(p_request_id, p_lock_token);
  v_retry := coalesce(p_retryable, false) and v_request.attempts < v_request.max_attempts;
  update public.design_requests
  set status = case when v_retry then 'pending' else 'failed' end,
      next_attempt_at = now() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 0), app.retry_delay_seconds(v_request.attempts))),
      error_code = left(p_error_code, 60),
      error_message = left(p_error_message, 300),
      lock_token = null, locked_by = null, locked_until = null
  where id = p_request_id;
  return case when v_retry then 'retry' else 'failed' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Carta pública: agrega el diseño del local
-- ---------------------------------------------------------------------------
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
  v_promotions jsonb;
  v_business_json jsonb;
  v_branch_json jsonb;
  v_today date;
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
    'theme', v_business.theme,
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

  v_today := (now() at time zone v_branch.timezone)::date;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'kind', p.kind,
      'title', p.title,
      'description', p.description,
      'items', p.items,
      'price_minor', p.price_minor,
      'starts_on', p.starts_on,
      'ends_on', p.ends_on,
      'weekdays', to_jsonb(p.weekdays),
      'start_time', to_char(p.start_time, 'HH24:MI'),
      'end_time', to_char(p.end_time, 'HH24:MI')
    ) order by p.kind, p.start_time, p.title), '[]'::jsonb)
  into v_promotions
  from public.promotions p
  join public.promotion_branches pb on pb.promotion_id = p.id and pb.branch_id = v_branch.id
  where not p.paused
    and p.ends_on >= v_today - 1
    and p.starts_on <= v_today + 1;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_menus) = 0 then 'unpublished' else 'ok' end,
    'business', v_business_json,
    'branch', v_branch_json,
    'menus', v_menus,
    'promotions', v_promotions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permisos (las funciones nuevas no se ejecutan por defecto: ver 20261026001300)
-- ---------------------------------------------------------------------------
revoke all on function public.set_business_website(uuid, text) from public, anon;
revoke all on function public.request_menu_design(uuid) from public, anon;
revoke all on function public.set_menu_theme(uuid, jsonb) from public, anon;
revoke all on function public.apply_menu_design(uuid) from public, anon;
grant execute on function public.set_business_website(uuid, text) to authenticated, service_role;
grant execute on function public.request_menu_design(uuid) to authenticated, service_role;
grant execute on function public.set_menu_theme(uuid, jsonb) to authenticated, service_role;
grant execute on function public.apply_menu_design(uuid) to authenticated, service_role;

revoke all on function public.worker_request_design_from_import(uuid) from public, anon, authenticated;
revoke all on function public.worker_claim_design(text, int) from public, anon, authenticated;
revoke all on function public.worker_complete_design(uuid, uuid, jsonb, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.worker_fail_design(uuid, uuid, text, text, boolean, int) from public, anon, authenticated;
grant execute on function public.worker_request_design_from_import(uuid) to service_role;
grant execute on function public.worker_claim_design(text, int) to service_role;
grant execute on function public.worker_complete_design(uuid, uuid, jsonb, text, text[], text, text) to service_role;
grant execute on function public.worker_fail_design(uuid, uuid, text, text, boolean, int) to service_role;

-- La usan restricciones CHECK: Postgres verifica el permiso de quien escribe
-- (el worker escribe con el rol de servicio).
grant execute on function app.is_valid_theme(jsonb) to service_role;

grant select on public.design_requests to authenticated;
grant all on public.design_requests to service_role;

-- get_public_menu se reemplazó: conserva sus permisos (anon y authenticated).
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;
