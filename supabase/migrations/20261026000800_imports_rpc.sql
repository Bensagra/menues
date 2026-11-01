-- CartaLista · RPC de importaciones
--
-- Flujo:
--   1. create_import (usuario): crea la importación en 'uploading' y reserva
--      rutas privadas para las fotos.
--   2. El servidor sube/valida las fotos y llama server_submit_import (solo
--      service role): fija metadatos verificados, detecta duplicados y reserva
--      cuota de forma atómica. Estado → pending.
--   3. El worker toma trabajos con worker_claim_import (lease + token), reporta
--      progreso, guarda extracciones por página y termina con
--      worker_complete_import o worker_fail_import.
--   4. El usuario revisa (decide_proposal / bulk_decide_proposals) y aplica
--      (apply_import) en una transacción con detección de conflictos.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function app.current_month()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'UTC')::date;
$$;

-- Libera la reserva y, si corresponde, registra el consumo. Idempotente.
create or replace function app.settle_import_quota(p_import public.imports, p_pages_used int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_import.quota_settled or p_import.quota_month is null then
    return;
  end if;
  update public.ai_usage_months
  set pages_reserved = greatest(0, pages_reserved - p_import.quota_reserved_pages),
      pages_used = pages_used + greatest(0, coalesce(p_pages_used, 0)),
      imports_failed = imports_failed + case when p_import.status = 'failed' then 1 else 0 end,
      updated_at = now()
  where business_id = p_import.business_id and month = p_import.quota_month;
  update public.imports set quota_settled = true where id = p_import.id;
end;
$$;

-- Permiso para crear/revisar una importación: carta completa si cubre todas las
-- sucursales del menú; si no, solo precios en sus sucursales.
create or replace function app.check_import_scope(
  p_membership public.memberships,
  p_menu_id uuid,
  p_scope text,
  p_branch_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
begin
  foreach v_branch in array p_branch_ids loop
    if not exists (select 1 from public.menu_branches where menu_id = p_menu_id and branch_id = v_branch) then
      perform app.fail(422, 'branch_not_in_menu');
    end if;
    if not app.membership_covers_branch(p_membership, v_branch) then
      perform app.fail(403, 'branch_scope');
    end if;
  end loop;
  if p_scope <> 'prices_only' and not app.membership_covers_menu(p_membership, p_menu_id) then
    perform app.fail(403, 'branch_scope');
  end if;
end;
$$;

create or replace function app.require_import_access(p_import_id uuid, p_lock boolean default false)
returns public.imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_membership public.memberships;
  v_branches uuid[];
begin
  perform app.require_user();
  if p_lock then
    select * into v_import from public.imports where id = p_import_id for update;
  else
    select * into v_import from public.imports where id = p_import_id;
  end if;
  if not found or not app.can_view_menu(v_import.business_id, v_import.menu_id) then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_import.business_id, 'imports.create');
  select coalesce(array_agg(branch_id), '{}') into v_branches from public.import_branches where import_id = p_import_id;
  perform app.check_import_scope(v_membership, v_import.menu_id, v_import.scope, v_branches);
  return v_import;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Crear la importación
-- p_files: [{name, type, size}]
-- ---------------------------------------------------------------------------
create or replace function public.create_import(
  p_menu_id uuid,
  p_branch_ids uuid[],
  p_scope text,
  p_category_ids uuid[],
  p_files jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_membership public.memberships;
  v_plan public.plans;
  v_existing public.imports;
  v_import_id uuid := gen_random_uuid();
  v_branches uuid[] := coalesce((select array_agg(distinct x) from unnest(p_branch_ids) x where x is not null), '{}');
  v_categories uuid[] := coalesce((select array_agg(distinct x) from unnest(p_category_ids) x where x is not null), '{}');
  v_count int;
  v_usage public.ai_usage_months;
  v_file jsonb;
  v_page int := 0;
  v_image_id uuid;
  v_ext text;
begin
  perform app.require_user();
  if p_idempotency_key is null then
    perform app.fail(422, 'idempotency_key_required');
  end if;
  select * into v_menu from public.menus where id = p_menu_id;
  if not found or not app.can_view_menu(v_menu.business_id, v_menu.id) then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_menu.business_id, 'imports.create');
  perform app.require_active_business(v_menu.business_id);

  select * into v_existing from public.imports
  where business_id = v_menu.business_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'import_id', v_existing.id,
      'replayed', true,
      'status', v_existing.status,
      'images', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'page_number', page_number, 'storage_path', storage_path) order by page_number)
        from public.import_images where import_id = v_existing.id
      ), '[]'::jsonb)
    );
  end if;

  if v_menu.status <> 'active' then
    perform app.fail(409, 'menu_archived');
  end if;
  if p_scope not in ('full', 'categories', 'prices_only') then
    perform app.fail(422, 'invalid_scope');
  end if;
  if cardinality(v_branches) = 0 then
    perform app.fail(422, 'branches_required');
  end if;
  perform app.check_import_scope(v_membership, p_menu_id, p_scope, v_branches);

  if p_scope = 'categories' then
    if cardinality(v_categories) = 0 then
      perform app.fail(422, 'categories_required');
    end if;
    if (select count(*) from public.categories where menu_id = p_menu_id and id = any (v_categories)) <> cardinality(v_categories) then
      perform app.fail(422, 'invalid_category');
    end if;
  else
    v_categories := '{}';
  end if;

  if p_files is null or jsonb_typeof(p_files) <> 'array' then
    perform app.fail(422, 'files_required');
  end if;
  v_count := jsonb_array_length(p_files);
  v_plan := app.current_plan(v_menu.business_id);
  if v_count = 0 then
    perform app.fail(422, 'files_required');
  end if;
  if v_count > least(v_plan.ai_max_pages_per_import, 30) then
    perform app.fail(422, 'too_many_files', least(v_plan.ai_max_pages_per_import, 30)::text);
  end if;
  for v_file in select * from jsonb_array_elements(p_files) loop
    if coalesce(v_file ->> 'type', '') not in ('image/jpeg', 'image/png', 'image/webp') then
      perform app.fail(422, 'invalid_file_type');
    end if;
    if coalesce((v_file ->> 'size')::bigint, 0) <= 0 or (v_file ->> 'size')::bigint > 20971520 then
      perform app.fail(422, 'file_too_large');
    end if;
  end loop;

  -- Chequeo temprano de cuota (la reserva definitiva ocurre al enviar).
  select * into v_usage from public.ai_usage_months where business_id = v_menu.business_id and month = app.current_month();
  if coalesce(v_usage.pages_reserved, 0) + coalesce(v_usage.pages_used, 0) + v_count > v_plan.ai_pages_per_month then
    perform app.fail(429, 'quota_exceeded',
      greatest(0, v_plan.ai_pages_per_month - coalesce(v_usage.pages_reserved, 0) - coalesce(v_usage.pages_used, 0))::text);
  end if;

  insert into public.imports (id, business_id, menu_id, scope, idempotency_key, page_count, created_by)
  values (v_import_id, v_menu.business_id, p_menu_id, p_scope, p_idempotency_key, v_count, auth.uid());

  insert into public.import_branches (business_id, import_id, branch_id)
  select v_menu.business_id, v_import_id, b from unnest(v_branches) b;
  insert into public.import_categories (business_id, menu_id, import_id, category_id)
  select v_menu.business_id, p_menu_id, v_import_id, c from unnest(v_categories) c;

  for v_file in select * from jsonb_array_elements(p_files) loop
    v_page := v_page + 1;
    v_image_id := gen_random_uuid();
    v_ext := case v_file ->> 'type' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
    insert into public.import_images (
      id, business_id, menu_id, import_id, page_number, storage_path, original_name, declared_type, declared_bytes
    )
    values (
      v_image_id, v_menu.business_id, p_menu_id, v_import_id, v_page,
      v_menu.business_id || '/' || v_import_id || '/' || v_image_id || '.' || v_ext,
      left(coalesce(v_file ->> 'name', ''), 200), v_file ->> 'type', (v_file ->> 'size')::int
    );
  end loop;

  return jsonb_build_object(
    'import_id', v_import_id,
    'replayed', false,
    'status', 'uploading',
    'images', (
      select jsonb_agg(jsonb_build_object('id', id, 'page_number', page_number, 'storage_path', storage_path) order by page_number)
      from public.import_images where import_id = v_import_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Enviar a la cola (solo service role, después de validar las fotos).
-- p_pages: [{image_id, page_number, rotation, sha256, bytes, width, height, format}]
-- ---------------------------------------------------------------------------
create or replace function public.server_submit_import(
  p_actor_id uuid,
  p_import_id uuid,
  p_pages jsonb,
  p_max_attempts int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
  v_membership public.memberships;
  v_plan public.plans;
  v_month date := app.current_month();
  v_usage public.ai_usage_months;
  v_count int;
  v_hash text;
  v_duplicate uuid;
  v_page jsonb;
begin
  select * into v_import from public.imports where id = p_import_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  if v_import.status <> 'uploading' then
    return jsonb_build_object('import_id', v_import.id, 'status', v_import.status, 'replayed', true);
  end if;
  if v_import.created_by <> p_actor_id then
    perform app.fail(403, 'forbidden');
  end if;
  select * into v_membership from public.memberships
  where business_id = v_import.business_id and user_id = p_actor_id and status = 'active';
  if not found or not app.role_permits(v_membership.role, v_membership.can_publish, 'imports.create') then
    perform app.fail(403, 'forbidden');
  end if;
  if (select status from public.businesses where id = v_import.business_id) <> 'active' then
    perform app.fail(403, 'business_suspended');
  end if;

  if p_pages is null or jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) = 0 then
    perform app.fail(422, 'files_required');
  end if;
  v_count := jsonb_array_length(p_pages);
  v_plan := app.current_plan(v_import.business_id);
  if v_count > least(v_plan.ai_max_pages_per_import, 30) then
    perform app.fail(422, 'too_many_files', least(v_plan.ai_max_pages_per_import, 30)::text);
  end if;

  for v_page in select * from jsonb_array_elements(p_pages) loop
    if not exists (select 1 from public.import_images where id = (v_page ->> 'image_id')::uuid and import_id = p_import_id) then
      perform app.fail(422, 'invalid_image');
    end if;
    if (v_page ->> 'page_number')::int not between 1 and v_count
       or coalesce((v_page ->> 'rotation')::int, -1) not in (0, 90, 180, 270)
       or coalesce(v_page ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_page ->> 'format', '') not in ('jpeg', 'png', 'webp') then
      perform app.fail(422, 'invalid_image_metadata');
    end if;
  end loop;
  if (select count(distinct (p ->> 'page_number')::int) from jsonb_array_elements(p_pages) p) <> v_count
     or (select count(distinct (p ->> 'image_id')) from jsonb_array_elements(p_pages) p) <> v_count then
    perform app.fail(422, 'invalid_page_order');
  end if;
  if (select count(distinct p ->> 'sha256') from jsonb_array_elements(p_pages) p) <> v_count then
    perform app.fail(422, 'duplicate_image');
  end if;

  -- Fotos que el usuario quitó antes de enviar.
  delete from public.import_images
  where import_id = p_import_id
    and id not in (select (p ->> 'image_id')::uuid from jsonb_array_elements(p_pages) p);

  -- Reasigna números de página (la unicidad se verifica al confirmar la transacción).
  update public.import_images i
  set page_number = (p ->> 'page_number')::int,
      rotation = (p ->> 'rotation')::int,
      sha256 = p ->> 'sha256',
      bytes = (p ->> 'bytes')::int,
      width = (p ->> 'width')::int,
      height = (p ->> 'height')::int,
      detected_format = p ->> 'format',
      status = 'ready'
  from jsonb_array_elements(p_pages) p
  where i.id = (p ->> 'image_id')::uuid;

  select app.sha256_hex(string_agg(sha256 || ':' || rotation, '|' order by page_number) || '|' || v_import.scope)
  into v_hash
  from public.import_images where import_id = p_import_id;

  select id into v_duplicate from public.imports
  where menu_id = v_import.menu_id and images_hash = v_hash and id <> p_import_id
    and status in ('pending', 'processing', 'needs_review')
  limit 1;
  if v_duplicate is not null then
    perform app.fail(409, 'duplicate_import', v_duplicate::text);
  end if;

  -- Reserva atómica de cuota: el bloqueo de fila serializa envíos concurrentes.
  insert into public.ai_usage_months (business_id, month) values (v_import.business_id, v_month)
  on conflict (business_id, month) do nothing;
  select * into v_usage from public.ai_usage_months
  where business_id = v_import.business_id and month = v_month
  for update;
  if v_usage.pages_reserved + v_usage.pages_used + v_count > v_plan.ai_pages_per_month then
    perform app.fail(429, 'quota_exceeded',
      greatest(0, v_plan.ai_pages_per_month - v_usage.pages_reserved - v_usage.pages_used)::text);
  end if;
  update public.ai_usage_months
  set pages_reserved = pages_reserved + v_count, updated_at = now()
  where business_id = v_import.business_id and month = v_month;

  update public.imports
  set status = 'pending',
      stage = 'queued',
      page_count = v_count,
      images_hash = v_hash,
      submitted_at = now(),
      next_attempt_at = now(),
      max_attempts = greatest(1, least(coalesce(p_max_attempts, 3), 10)),
      quota_month = v_month,
      quota_reserved_pages = v_count,
      quota_settled = false
  where id = p_import_id;

  perform app.audit(v_import.business_id, 'import.submitted', 'import', p_import_id,
    'Envió ' || v_count || case when v_count = 1 then ' foto' else ' fotos' end || ' para actualizar la carta',
    jsonb_build_object('scope', v_import.scope, 'pages', v_count), null, p_actor_id, 'user');

  return jsonb_build_object('import_id', p_import_id, 'status', 'pending', 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Protocolo del worker (solo service role)
-- ---------------------------------------------------------------------------
create or replace function public.worker_heartbeat(
  p_worker_id text,
  p_started_at timestamptz,
  p_provider text,
  p_model text,
  p_ai_configured boolean,
  p_version text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.worker_heartbeats (worker_id, started_at, last_seen_at, provider, model, ai_configured, version)
  values (p_worker_id, p_started_at, now(), p_provider, p_model, p_ai_configured, p_version)
  on conflict (worker_id) do update
    set last_seen_at = now(), provider = excluded.provider, model = excluded.model,
        ai_configured = excluded.ai_configured, version = excluded.version, started_at = excluded.started_at;
$$;

create or replace function app.retry_delay_seconds(p_attempt int)
returns int
language sql
immutable
set search_path = ''
as $$
  select least(900, (30 * power(2, greatest(p_attempt - 1, 0)))::int);
$$;

create or replace function public.worker_claim_import(p_worker_id text, p_lease_seconds int default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired public.imports;
  v_id uuid;
  v_import public.imports;
begin
  -- Recupera trabajos cuyo worker dejó de renovar el lease.
  for v_expired in
    select * from public.imports
    where status = 'processing' and locked_until < now()
    for update skip locked
  loop
    if v_expired.attempts >= v_expired.max_attempts then
      update public.imports
      set status = 'failed', stage = 'failed', failed_at = now(), lock_token = null, locked_by = null, locked_until = null,
          error_code = 'interrupted', error_message = 'El procesamiento se interrumpió varias veces.'
      where id = v_expired.id
      returning * into v_expired;
      perform app.settle_import_quota(v_expired, 0);
      perform app.audit(v_expired.business_id, 'import.failed', 'import', v_expired.id,
        'La importación falló: el procesamiento se interrumpió', '{}'::jsonb, null, null, 'worker');
    else
      update public.imports
      set status = 'pending', stage = 'retry_wait', lock_token = null, locked_by = null, locked_until = null,
          next_attempt_at = now() + make_interval(secs => app.retry_delay_seconds(v_expired.attempts)),
          error_code = 'interrupted', error_message = 'El procesamiento se interrumpió; se reintentará.'
      where id = v_expired.id;
    end if;
  end loop;

  select i.id into v_id
  from public.imports i
  where i.status = 'pending'
    and i.next_attempt_at <= now()
    -- Las cuentas suspendidas no se procesan: sus trabajos esperan en la cola.
    and exists (select 1 from public.businesses b where b.id = i.business_id and b.status = 'active')
    -- Control de concurrencia: como máximo 2 trabajos simultáneos por negocio.
    and (select count(*) from public.imports p where p.business_id = i.business_id and p.status = 'processing') < 2
  order by i.next_attempt_at, i.created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.imports
  set status = 'processing',
      stage = 'preparing',
      stage_page = null,
      attempts = attempts + 1,
      locked_by = left(p_worker_id, 120),
      locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))),
      lock_token = gen_random_uuid(),
      processing_started_at = coalesce(processing_started_at, now())
  where id = v_id
  returning * into v_import;

  return to_jsonb(v_import) - 'extraction';
end;
$$;

create or replace function app.worker_lock(p_import_id uuid, p_lock_token uuid)
returns public.imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
begin
  select * into v_import from public.imports where id = p_import_id for update;
  if not found or v_import.status <> 'processing' or v_import.lock_token is distinct from p_lock_token then
    perform app.fail(409, 'lease_lost');
  end if;
  return v_import;
end;
$$;

-- Devuelve 'continue' o 'stop' (cancelada o lease perdido).
create or replace function public.worker_progress(
  p_import_id uuid,
  p_lock_token uuid,
  p_stage text,
  p_stage_page int default null,
  p_lease_seconds int default 300
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports;
begin
  select * into v_import from public.imports where id = p_import_id for update;
  if not found or v_import.status <> 'processing' or v_import.lock_token is distinct from p_lock_token then
    return 'stop';
  end if;
  if p_stage not in ('preparing', 'reading', 'comparing') then
    perform app.fail(422, 'invalid_stage');
  end if;
  update public.imports
  set stage = p_stage,
      stage_page = p_stage_page,
      locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600)))
  where id = p_import_id;
  return 'continue';
end;
$$;

create or replace function public.worker_save_page(
  p_import_id uuid,
  p_lock_token uuid,
  p_image_id uuid,
  p_extraction jsonb,
  p_usage jsonb,
  p_provider text,
  p_model text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.worker_lock(p_import_id, p_lock_token);
  v_in bigint := coalesce((p_usage ->> 'input_tokens')::bigint, 0);
  v_out bigint := coalesce((p_usage ->> 'output_tokens')::bigint, 0);
  v_cost bigint := coalesce((p_usage ->> 'cost_usd_ticks')::bigint, 0);
begin
  update public.import_images
  set extraction = p_extraction, extracted_at = now(), status = 'extracted', error_code = null
  where id = p_image_id and import_id = p_import_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;

  update public.imports
  set provider = p_provider,
      model = p_model,
      usage = jsonb_build_object(
        'input_tokens', coalesce((usage ->> 'input_tokens')::bigint, 0) + v_in,
        'output_tokens', coalesce((usage ->> 'output_tokens')::bigint, 0) + v_out,
        'cost_usd_ticks', coalesce((usage ->> 'cost_usd_ticks')::bigint, 0) + v_cost,
        'requests', coalesce((usage ->> 'requests')::int, 0) + 1
      )
  where id = p_import_id;

  insert into public.ai_usage_months (business_id, month) values (v_import.business_id, app.current_month())
  on conflict (business_id, month) do nothing;
  update public.ai_usage_months
  set input_tokens = input_tokens + v_in, output_tokens = output_tokens + v_out, cost_usd_ticks = cost_usd_ticks + v_cost,
      updated_at = now()
  where business_id = v_import.business_id and month = app.current_month();
end;
$$;

create or replace function public.worker_mark_page_failed(
  p_import_id uuid,
  p_lock_token uuid,
  p_image_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.worker_lock(p_import_id, p_lock_token);
  update public.import_images set status = 'failed', error_code = left(p_error_code, 60)
  where id = p_image_id and import_id = p_import_id;
end;
$$;

-- p_proposals: [{position, kind, status, needs_review, applicable, product_id,
--   category_id, new_category_ref, base_revision, page_number, current_value,
--   detected_value, proposed_value, flags, reason}]
create or replace function public.worker_complete_import(
  p_import_id uuid,
  p_lock_token uuid,
  p_extraction jsonb,
  p_proposals jsonb,
  p_summary jsonb,
  p_base_state jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.worker_lock(p_import_id, p_lock_token);
  v_pages int;
begin
  if p_proposals is null or jsonb_typeof(p_proposals) <> 'array' then
    perform app.fail(422, 'invalid_proposals');
  end if;

  delete from public.import_proposals where import_id = p_import_id;
  insert into public.import_proposals (
    business_id, menu_id, import_id, position, kind, status, needs_review, applicable, product_id, category_id,
    new_category_ref, base_revision, page_number, current_value, detected_value, proposed_value, flags, reason
  )
  select v_import.business_id, v_import.menu_id, p_import_id,
         (x ->> 'position')::int,
         x ->> 'kind',
         coalesce(x ->> 'status', 'pending'),
         coalesce((x ->> 'needs_review')::boolean, false),
         coalesce((x ->> 'applicable')::boolean, true),
         nullif(x ->> 'product_id', '')::uuid,
         nullif(x ->> 'category_id', '')::uuid,
         nullif(x ->> 'new_category_ref', ''),
         nullif(x ->> 'base_revision', '')::int,
         nullif(x ->> 'page_number', '')::int,
         nullif(x -> 'current_value', 'null'::jsonb),
         coalesce(nullif(x -> 'detected_value', 'null'::jsonb), '{}'::jsonb),
         nullif(x -> 'proposed_value', 'null'::jsonb),
         coalesce((select array_agg(f) from jsonb_array_elements_text(x -> 'flags') f), '{}'),
         left(coalesce(x ->> 'reason', ''), 500)
  from jsonb_array_elements(p_proposals) x;

  select count(*) into v_pages from public.import_images where import_id = p_import_id and status = 'extracted';

  update public.imports
  set status = 'needs_review',
      stage = 'ready',
      stage_page = null,
      lock_token = null,
      locked_by = null,
      locked_until = null,
      processed_at = now(),
      error_code = null,
      error_message = null,
      extraction = p_extraction,
      summary = coalesce(p_summary, '{}'::jsonb),
      base_menu_state = p_base_state
  where id = p_import_id
  returning * into v_import;

  perform app.settle_import_quota(v_import, v_pages);
  perform app.audit(v_import.business_id, 'import.processed', 'import', p_import_id,
    'Las fotos se procesaron y hay cambios para revisar', coalesce(p_summary, '{}'::jsonb), null, null, 'worker');
end;
$$;

-- Devuelve 'retry_scheduled' o 'failed'.
create or replace function public.worker_fail_import(
  p_import_id uuid,
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
  v_import public.imports := app.worker_lock(p_import_id, p_lock_token);
begin
  if p_retryable and v_import.attempts < v_import.max_attempts then
    update public.imports
    set status = 'pending',
        stage = 'retry_wait',
        stage_page = null,
        lock_token = null,
        locked_by = null,
        locked_until = null,
        error_code = left(p_error_code, 60),
        error_message = left(p_error_message, 500),
        next_attempt_at = now() + make_interval(secs => greatest(
          coalesce(p_retry_after_seconds, 0), app.retry_delay_seconds(v_import.attempts)))
    where id = p_import_id;
    return 'retry_scheduled';
  end if;

  update public.imports
  set status = 'failed',
      stage = 'failed',
      stage_page = null,
      lock_token = null,
      locked_by = null,
      locked_until = null,
      failed_at = now(),
      error_code = left(p_error_code, 60),
      error_message = left(p_error_message, 500)
  where id = p_import_id
  returning * into v_import;

  perform app.settle_import_quota(v_import, 0);
  perform app.audit(v_import.business_id, 'import.failed', 'import', p_import_id,
    'La importación falló: ' || left(p_error_message, 200),
    jsonb_build_object('error_code', p_error_code, 'attempts', v_import.attempts), null, null, 'worker');
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Acciones del usuario
-- ---------------------------------------------------------------------------
create or replace function public.cancel_import(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.require_import_access(p_import_id, true);
begin
  if v_import.status in ('completed', 'failed', 'cancelled') then
    return;
  end if;
  update public.imports
  set status = 'cancelled',
      stage = 'cancelled',
      stage_page = null,
      lock_token = null,
      locked_by = null,
      locked_until = null,
      cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = p_import_id
  returning * into v_import;
  perform app.settle_import_quota(v_import, 0);
  update public.import_proposals set status = 'skipped' where import_id = p_import_id and status in ('pending', 'approved', 'conflict');
  perform app.audit(v_import.business_id, 'import.cancelled', 'import', p_import_id, 'Canceló una importación', '{}'::jsonb);
end;
$$;

create or replace function public.retry_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.require_import_access(p_import_id, true);
begin
  perform app.require_active_business(v_import.business_id);
  return app.requeue_import(v_import, auth.uid(), 'user');
end;
$$;

-- Reencola una importación fallida. Idempotente: si ya no está fallida, no hace nada.
create or replace function app.requeue_import(p_import public.imports, p_actor_id uuid, p_actor_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans := app.current_plan(p_import.business_id);
  v_month date := app.current_month();
  v_usage public.ai_usage_months;
begin
  if p_import.status <> 'failed' then
    return jsonb_build_object('import_id', p_import.id, 'status', p_import.status, 'requeued', false);
  end if;

  insert into public.ai_usage_months (business_id, month) values (p_import.business_id, v_month)
  on conflict (business_id, month) do nothing;
  select * into v_usage from public.ai_usage_months where business_id = p_import.business_id and month = v_month for update;
  if v_usage.pages_reserved + v_usage.pages_used + p_import.page_count > v_plan.ai_pages_per_month then
    perform app.fail(429, 'quota_exceeded',
      greatest(0, v_plan.ai_pages_per_month - v_usage.pages_reserved - v_usage.pages_used)::text);
  end if;
  update public.ai_usage_months set pages_reserved = pages_reserved + p_import.page_count, updated_at = now()
  where business_id = p_import.business_id and month = v_month;

  update public.import_images set status = 'ready', error_code = null
  where import_id = p_import.id and status = 'failed';

  update public.imports
  set status = 'pending', stage = 'queued', attempts = 0, next_attempt_at = now(), failed_at = null,
      error_code = null, error_message = null,
      quota_month = v_month, quota_reserved_pages = p_import.page_count, quota_settled = false
  where id = p_import.id;

  perform app.audit(p_import.business_id, 'import.retried', 'import', p_import.id, 'Reintentó una importación fallida',
    '{}'::jsonb, null, p_actor_id, p_actor_kind);
  return jsonb_build_object('import_id', p_import.id, 'status', 'pending', 'requeued', true);
end;
$$;

-- Valida una corrección del usuario según el tipo de propuesta y el alcance.
create or replace function app.validate_correction(p_kind text, p_scope text, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_allowed text[];
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    perform app.fail(422, 'invalid_correction');
  end if;
  v_allowed := case
    when p_scope = 'prices_only' then array['price_minor', 'variants', 'resolution']
    else array['name', 'description', 'price_minor', 'variants', 'resolution', 'category_id', 'category_ref']
  end;
  for v_key in select jsonb_object_keys(p_value) loop
    if not (v_key = any (v_allowed)) then
      perform app.fail(422, 'correction_field_not_allowed', v_key);
    end if;
  end loop;
  -- Un valor null en la corrección significa "no cambiar este campo".
  if p_value ? 'name' and jsonb_typeof(p_value -> 'name') <> 'null'
     and char_length(btrim(coalesce(p_value ->> 'name', ''))) not between 1 and 120 then
    perform app.fail(422, 'invalid_name');
  end if;
  if p_value ? 'description' and jsonb_typeof(p_value -> 'description') <> 'null'
     and char_length(coalesce(p_value ->> 'description', '')) > 600 then
    perform app.fail(422, 'description_too_long');
  end if;
  if p_value ? 'price_minor' then
    perform app.check_price(app.jsonb_bigint(p_value -> 'price_minor'), 'price_minor');
  end if;
  if p_value ? 'resolution' and coalesce(p_value ->> 'resolution', '') not in ('same', 'new') then
    perform app.fail(422, 'invalid_resolution');
  end if;
  if p_value ? 'variants' and jsonb_typeof(p_value -> 'variants') <> 'null' then
    if jsonb_typeof(p_value -> 'variants') <> 'array' or jsonb_array_length(p_value -> 'variants') > 20 then
      perform app.fail(422, 'invalid_variants');
    end if;
    perform app.check_price(app.jsonb_bigint(v -> 'price_minor'), 'variant')
    from jsonb_array_elements(p_value -> 'variants') v;
  end if;
  return p_value;
end;
$$;

create or replace function public.decide_proposal(p_proposal_id uuid, p_decision text, p_correction jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.import_proposals;
  v_import public.imports;
  v_value jsonb;
begin
  select * into v_proposal from public.import_proposals where id = p_proposal_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_import := app.require_import_access(v_proposal.import_id, true);
  perform app.require_active_business(v_import.business_id);
  if v_import.status <> 'needs_review' then
    perform app.fail(409, 'import_not_in_review');
  end if;
  if v_proposal.status in ('applied', 'skipped') then
    perform app.fail(409, 'proposal_closed');
  end if;
  if p_decision not in ('approve', 'reject', 'reset') then
    perform app.fail(422, 'invalid_decision');
  end if;

  if p_decision = 'approve' then
    if not v_proposal.applicable then
      perform app.fail(422, 'proposal_not_applicable');
    end if;
    if p_correction is not null then
      v_value := jsonb_strip_nulls(
        (case when jsonb_typeof(v_proposal.proposed_value) = 'object' then v_proposal.proposed_value else '{}'::jsonb end)
        || app.validate_correction(v_proposal.kind, v_import.scope, p_correction)
      );
    else
      v_value := case when jsonb_typeof(v_proposal.proposed_value) = 'object' then v_proposal.proposed_value else null end;
    end if;
    if v_proposal.kind = 'illegible' and (p_correction is null or not (p_correction ? 'price_minor' or p_correction ? 'name')) then
      perform app.fail(422, 'correction_required');
    end if;
    if v_proposal.kind in ('uncertain_match', 'possible_duplicate') and coalesce(v_value ->> 'resolution', '') not in ('same', 'new') then
      perform app.fail(422, 'resolution_required');
    end if;
    if v_value is null then
      perform app.fail(422, 'correction_required');
    end if;
    -- En una propuesta en conflicto, aprobar significa confirmar contra la versión actual.
    update public.import_proposals
    set status = 'approved',
        proposed_value = v_value,
        corrected = corrected or p_correction is not null,
        base_revision = case when v_proposal.status = 'conflict'
                             then (select revision from public.products where id = v_proposal.product_id)
                             else base_revision end,
        decided_by = auth.uid(),
        decided_at = now()
    where id = p_proposal_id
    returning * into v_proposal;
  elsif p_decision = 'reject' then
    update public.import_proposals set status = 'rejected', decided_by = auth.uid(), decided_at = now()
    where id = p_proposal_id returning * into v_proposal;
  else
    update public.import_proposals
    set status = case when v_proposal.status = 'conflict' then 'conflict' else 'pending' end,
        decided_by = null, decided_at = null
    where id = p_proposal_id returning * into v_proposal;
  end if;
  return to_jsonb(v_proposal);
end;
$$;

-- Aprueba en conjunto las propuestas válidas (sin ambigüedades) o descarta las pendientes.
create or replace function public.bulk_decide_proposals(p_import_id uuid, p_decision text, p_kinds text[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.require_import_access(p_import_id, true);
  v_count int;
begin
  perform app.require_active_business(v_import.business_id);
  if v_import.status <> 'needs_review' then
    perform app.fail(409, 'import_not_in_review');
  end if;
  if p_decision = 'approve' then
    update public.import_proposals
    set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where import_id = p_import_id and status = 'pending' and applicable and not needs_review
      and proposed_value is not null
      and kind not in ('illegible', 'uncertain_match', 'possible_duplicate')
      and (p_kinds is null or kind = any (p_kinds));
  elsif p_decision = 'reject' then
    update public.import_proposals
    set status = 'rejected', decided_by = auth.uid(), decided_at = now()
    where import_id = p_import_id and status in ('pending', 'conflict')
      and (p_kinds is null or kind = any (p_kinds));
  else
    perform app.fail(422, 'invalid_decision');
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Aplica una propuesta aprobada sobre el borrador. Uso interno de apply_import.
create or replace function app.apply_proposal(
  p_import public.imports,
  p_proposal public.import_proposals,
  p_branches uuid[],
  p_base_scope boolean,
  p_covers_menu boolean,
  p_category_map jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value jsonb := p_proposal.proposed_value;
  v_prices_only boolean := p_import.scope = 'prices_only';
  v_changed boolean := false;
  v_product public.products;
  v_kind text := p_proposal.kind;
  v_target_category uuid;
  v_new_id uuid;
  v_var jsonb;
  v_ord int;
  v_branch uuid;
  v_categories uuid[];
begin
  if v_value is null or jsonb_typeof(v_value) <> 'object' then
    perform app.fail(422, 'invalid_proposal', p_proposal.id::text);
  end if;
  select coalesce(array_agg(category_id), '{}') into v_categories from public.import_categories where import_id = p_import.id;

  if v_kind in ('uncertain_match', 'possible_duplicate', 'illegible') then
    if p_proposal.product_id is not null and coalesce(v_value ->> 'resolution', 'same') = 'same' then
      v_kind := 'update_existing';
    else
      v_kind := 'new_product';
    end if;
  end if;

  if v_kind = 'new_category' then
    if v_prices_only or p_import.scope = 'categories' then
      perform app.fail(422, 'scope_violation');
    end if;
    if not p_covers_menu then
      perform app.fail(403, 'branch_scope');
    end if;
    select id into v_new_id from public.categories
    where menu_id = p_import.menu_id and name_key = app.name_key(v_value ->> 'name');
    if v_new_id is null then
      insert into public.categories (business_id, menu_id, name, sort_order)
      values (p_import.business_id, p_import.menu_id, btrim(v_value ->> 'name'),
              coalesce((select max(sort_order) + 1 from public.categories where menu_id = p_import.menu_id), 0))
      returning id into v_new_id;
    end if;
    return jsonb_build_object('category_ref', p_proposal.new_category_ref, 'category_id', v_new_id);
  end if;

  if v_kind = 'new_product' then
    if v_prices_only then
      perform app.fail(422, 'scope_violation');
    end if;
    if not p_covers_menu then
      perform app.fail(403, 'branch_scope');
    end if;
    v_target_category := coalesce(
      nullif(v_value ->> 'category_id', '')::uuid,
      p_proposal.category_id,
      nullif(p_category_map ->> coalesce(v_value ->> 'category_ref', p_proposal.new_category_ref, ''), '')::uuid
    );
    if v_target_category is null or not exists (
      select 1 from public.categories where id = v_target_category and menu_id = p_import.menu_id
    ) then
      perform app.fail(422, 'invalid_category');
    end if;
    if p_import.scope = 'categories' and not (v_target_category = any (v_categories)) then
      perform app.fail(422, 'scope_violation');
    end if;
    if exists (
      select 1 from public.products
      where category_id = v_target_category and name_key = app.name_key(v_value ->> 'name') and archived_at is null
    ) then
      return jsonb_build_object('conflict', 'product_name_taken');
    end if;
    insert into public.products (
      business_id, menu_id, category_id, name, description, price_minor, status, sort_order, created_by, updated_by
    )
    values (
      p_import.business_id, p_import.menu_id, v_target_category, btrim(v_value ->> 'name'),
      btrim(coalesce(v_value ->> 'description', '')), app.jsonb_bigint(v_value -> 'price_minor'), 'available',
      coalesce((select max(sort_order) + 1 from public.products where category_id = v_target_category), 0),
      auth.uid(), auth.uid()
    )
    returning id into v_new_id;
    v_ord := 0;
    for v_var in select * from jsonb_array_elements(coalesce(v_value -> 'variants', '[]'::jsonb)) loop
      insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order)
      values (p_import.business_id, p_import.menu_id, v_new_id, btrim(v_var ->> 'name'), app.jsonb_bigint(v_var -> 'price_minor'), v_ord)
      on conflict (product_id, name_key) do nothing;
      v_ord := v_ord + 1;
    end loop;
    return jsonb_build_object('product_id', v_new_id);
  end if;

  -- Cambios sobre un producto existente.
  select * into v_product from public.products where id = p_proposal.product_id and menu_id = p_import.menu_id for update;
  if not found or v_product.archived_at is not null then
    return jsonb_build_object('conflict', 'product_missing');
  end if;
  if p_proposal.base_revision is not null and v_product.revision <> p_proposal.base_revision then
    return jsonb_build_object('conflict', 'revision_conflict');
  end if;
  if p_import.scope = 'categories' and not (v_product.category_id = any (v_categories)) then
    perform app.fail(422, 'scope_violation');
  end if;

  if v_value ? 'price_minor' and app.jsonb_bigint(v_value -> 'price_minor') is not null then
    v_changed := true;
    if p_base_scope then
      update public.products set price_minor = app.jsonb_bigint(v_value -> 'price_minor') where id = v_product.id;
    else
      foreach v_branch in array p_branches loop
        insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, price_minor, updated_by)
        values (p_import.business_id, p_import.menu_id, v_product.id, v_branch, app.jsonb_bigint(v_value -> 'price_minor'), auth.uid())
        on conflict (product_id, branch_id) do update set price_minor = excluded.price_minor, updated_by = excluded.updated_by, updated_at = now();
      end loop;
    end if;
  end if;

  if not v_prices_only then
    if v_value ? 'name' and btrim(coalesce(v_value ->> 'name', '')) <> '' and (v_kind in ('name_change', 'update_existing')) then
      if not p_covers_menu then
        perform app.fail(403, 'branch_scope');
      end if;
      update public.products set name = btrim(v_value ->> 'name') where id = v_product.id;
      v_changed := true;
    end if;
    if v_value ? 'description' and (v_kind in ('description_change', 'update_existing')) and btrim(coalesce(v_value ->> 'description', '')) <> '' then
      if not p_covers_menu then
        perform app.fail(403, 'branch_scope');
      end if;
      update public.products set description = btrim(v_value ->> 'description') where id = v_product.id;
      v_changed := true;
    end if;
  end if;

  if v_value ? 'variants' then
    for v_var in select * from jsonb_array_elements(v_value -> 'variants') loop
      if nullif(v_var ->> 'variant_id', '') is not null then
        if app.jsonb_bigint(v_var -> 'price_minor') is not null then
          v_changed := true;
          if p_base_scope then
            update public.product_variants set price_minor = app.jsonb_bigint(v_var -> 'price_minor')
            where id = (v_var ->> 'variant_id')::uuid and product_id = v_product.id;
          else
            foreach v_branch in array p_branches loop
              insert into public.variant_branch_prices (business_id, menu_id, variant_id, branch_id, price_minor, updated_by)
              select p_import.business_id, p_import.menu_id, pv.id, v_branch, app.jsonb_bigint(v_var -> 'price_minor'), auth.uid()
              from public.product_variants pv where pv.id = (v_var ->> 'variant_id')::uuid and pv.product_id = v_product.id
              on conflict (variant_id, branch_id) do update set price_minor = excluded.price_minor, updated_by = excluded.updated_by, updated_at = now();
            end loop;
          end if;
        end if;
      elsif not v_prices_only and p_covers_menu and btrim(coalesce(v_var ->> 'name', '')) <> '' then
        insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order)
        values (p_import.business_id, p_import.menu_id, v_product.id, btrim(v_var ->> 'name'), app.jsonb_bigint(v_var -> 'price_minor'),
                coalesce((select max(sort_order) + 1 from public.product_variants where product_id = v_product.id), 0))
        on conflict (product_id, name_key) do nothing;
        v_changed := true;
      end if;
    end loop;
  end if;

  -- Una propuesta aprobada que no cambia nada indica datos inconsistentes: se
  -- aborta toda la aplicación en lugar de marcarla como aplicada.
  if not v_changed then
    perform app.fail(422, 'proposal_empty', p_proposal.id::text);
  end if;

  update public.products set revision = revision + 1, updated_by = auth.uid() where id = v_product.id;
  return jsonb_build_object('product_id', v_product.id);
end;
$$;

-- Aplica las propuestas aprobadas al borrador. Todo o nada. Si detecta que
-- alguien modificó un producto después del análisis, marca los conflictos y no
-- aplica nada hasta que se resuelvan. Repetir la llamada no duplica cambios.
create or replace function public.apply_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.imports := app.require_import_access(p_import_id, true);
  v_membership public.memberships;
  v_menu public.menus;
  v_branches uuid[];
  v_base_scope boolean;
  v_covers_menu boolean;
  v_pending int;
  v_conflicts jsonb := '[]'::jsonb;
  v_proposal public.import_proposals;
  v_result jsonb;
  v_category_map jsonb := '{}'::jsonb;
  v_applied int := 0;
begin
  if v_import.status = 'completed' then
    return jsonb_build_object('status', 'applied', 'replayed', true,
      'applied', (select count(*) from public.import_proposals where import_id = p_import_id and status = 'applied'));
  end if;
  if v_import.status <> 'needs_review' then
    perform app.fail(409, 'import_not_in_review');
  end if;
  perform app.require_active_business(v_import.business_id);
  select * into v_menu from public.menus where id = v_import.menu_id for update;
  if v_menu.status <> 'active' then
    perform app.fail(409, 'menu_archived');
  end if;
  v_membership := app.require_permission(v_import.business_id, 'catalog.edit');
  v_covers_menu := app.membership_covers_menu(v_membership, v_import.menu_id);

  select coalesce(array_agg(branch_id order by branch_id), '{}') into v_branches from public.import_branches where import_id = p_import_id;
  -- Si la importación cubre todas las sucursales del menú, los precios van al
  -- precio base; si no, quedan como precio propio de las sucursales elegidas.
  v_base_scope := not exists (
    select 1 from public.menu_branches mb where mb.menu_id = v_import.menu_id and not (mb.branch_id = any (v_branches))
  );

  select count(*) into v_pending from public.import_proposals
  where import_id = p_import_id and status in ('pending', 'conflict') and applicable;
  if v_pending > 0 then
    perform app.fail(409, 'pending_decisions', v_pending::text);
  end if;

  -- Detección de conflictos antes de escribir.
  for v_proposal in
    select * from public.import_proposals
    where import_id = p_import_id and status = 'approved' and product_id is not null
      and not (kind in ('uncertain_match', 'possible_duplicate', 'illegible') and coalesce(proposed_value ->> 'resolution', 'same') = 'new')
    order by position
  loop
    if not exists (
      select 1 from public.products p
      where p.id = v_proposal.product_id and p.archived_at is null
        and (v_proposal.base_revision is null or p.revision = v_proposal.base_revision)
    ) then
      update public.import_proposals
      set status = 'conflict',
          current_value = (
            select jsonb_build_object(
              'name', p.name, 'description', p.description, 'price_minor', p.price_minor, 'archived', p.archived_at is not null,
              'variants', coalesce((select jsonb_agg(jsonb_build_object('variant_id', v.id, 'name', v.name, 'price_minor', v.price_minor) order by v.sort_order)
                                    from public.product_variants v where v.product_id = p.id), '[]'::jsonb))
            from public.products p where p.id = v_proposal.product_id
          )
      where id = v_proposal.id;
      v_conflicts := v_conflicts || to_jsonb(v_proposal.id);
    end if;
  end loop;
  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflicts', 'conflicts', v_conflicts);
  end if;

  for v_proposal in
    select * from public.import_proposals
    where import_id = p_import_id and status = 'approved'
    order by case when kind = 'new_category' then 0 else 1 end, position
  loop
    v_result := app.apply_proposal(v_import, v_proposal, v_branches, v_base_scope, v_covers_menu, v_category_map);
    if v_result ? 'conflict' then
      -- Conflicto detectado durante la escritura: se revierte todo.
      perform app.fail(409, 'apply_conflict', v_proposal.id::text || ':' || (v_result ->> 'conflict'));
    end if;
    if v_result ? 'category_ref' and v_result ->> 'category_ref' is not null then
      v_category_map := v_category_map || jsonb_build_object(v_result ->> 'category_ref', v_result ->> 'category_id');
    end if;
    update public.import_proposals set status = 'applied', applied_at = now() where id = v_proposal.id;
    v_applied := v_applied + 1;
  end loop;

  update public.import_proposals set status = 'skipped'
  where import_id = p_import_id and status in ('pending') and not applicable;

  update public.imports
  set status = 'completed', stage = 'applied', completed_at = now(), applied_by = auth.uid()
  where id = p_import_id;

  update public.ai_usage_months set imports_completed = imports_completed + 1, updated_at = now()
  where business_id = v_import.business_id and month = coalesce(v_import.quota_month, app.current_month());

  perform app.audit(v_import.business_id, 'import.applied', 'import', p_import_id,
    'Aplicó ' || v_applied || ' cambios de una importación al borrador',
    jsonb_build_object('applied', v_applied, 'base_scope', v_base_scope),
    case when cardinality(v_branches) = 1 then v_branches[1] else null end);

  return jsonb_build_object('status', 'applied', 'replayed', false, 'applied', v_applied, 'menu_id', v_import.menu_id);
end;
$$;
