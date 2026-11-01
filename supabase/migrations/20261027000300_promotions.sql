-- CartaLista · Menú del día y promociones programadas
--
-- Se programan por fechas (desde/hasta, inclusive), días de la semana y una
-- franja horaria, siempre en la hora local de cada sucursal. El estado
-- (programada, activa, finalizada) se calcula con la hora actual: no se guarda.
--
-- Guardar una promoción la deja visible en la carta pública según su
-- programación, por eso requiere el permiso promotions.manage (el mismo nivel
-- que publicar). Dos menús del día no pueden superponerse en una sucursal; las
-- promociones superpuestas se permiten pero se advierten.

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('daily_menu', 'promotion')),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 400),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 12),
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000000),
  starts_on date not null,
  ends_on date not null,
  weekdays smallint[] not null check (
    cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  start_time time not null,
  end_time time not null,
  paused boolean not null default false,
  revision int not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 366),
  check (end_time > start_time)
);

create index promotions_business on public.promotions (business_id, ends_on);

create trigger promotions_touch before update on public.promotions
  for each row execute function app.touch_updated_at();

create table public.promotion_branches (
  business_id uuid not null,
  promotion_id uuid not null,
  branch_id uuid not null,
  primary key (promotion_id, branch_id),
  foreign key (business_id, promotion_id) references public.promotions (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

create index promotion_branches_branch on public.promotion_branches (branch_id);

alter table public.promotions enable row level security;
alter table public.promotion_branches enable row level security;

create policy promotion_branches_select on public.promotion_branches for select to authenticated
  using (app.can_access_branch(business_id, branch_id));

create policy promotions_select on public.promotions for select to authenticated
  using (
    app.is_member(business_id)
    and exists (select 1 from public.promotion_branches pb where pb.promotion_id = promotions.id)
  );

grant select on public.promotions, public.promotion_branches to authenticated;

-- ---------------------------------------------------------------------------
-- Superposición: comparten una fecha real (dentro de ambos períodos y de
-- ambos conjuntos de días) y sus franjas horarias se cruzan.
-- ---------------------------------------------------------------------------
create or replace function app.promotion_windows_overlap(
  a_starts date, a_ends date, a_days smallint[], a_start time, a_end time,
  b_starts date, b_ends date, b_days smallint[], b_start time, b_end time
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_from date := greatest(a_starts, b_starts);
  v_to date := least(a_ends, b_ends);
begin
  if v_from > v_to or not (a_start < b_end and b_start < a_end) then
    return false;
  end if;
  -- Los días de la semana se repiten: alcanza con mirar hasta 7 fechas.
  return exists (
    select 1
    from generate_series(v_from::timestamp, least(v_to, v_from + 6)::timestamp, interval '1 day') as d(day)
    where extract(dow from d.day)::smallint = any (a_days)
      and extract(dow from d.day)::smallint = any (b_days)
  );
end;
$$;

-- Otras promociones del mismo tipo, sin pausar, que comparten sucursal y se superponen.
create or replace function app.promotion_overlaps(
  p_business_id uuid, p_exclude_id uuid, p_kind text, p_branch_ids uuid[],
  p_starts date, p_ends date, p_days smallint[], p_start time, p_end time
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title) order by p.starts_on, p.title), '[]'::jsonb)
  from public.promotions p
  where p.business_id = p_business_id
    and p.kind = p_kind
    and not p.paused
    and (p_exclude_id is null or p.id <> p_exclude_id)
    and exists (select 1 from public.promotion_branches pb where pb.promotion_id = p.id and pb.branch_id = any (p_branch_ids))
    and app.promotion_windows_overlap(p.starts_on, p.ends_on, p.weekdays, p.start_time, p.end_time,
                                      p_starts, p_ends, p_days, p_start, p_end);
$$;

-- El alcance de quien edita tiene que cubrir todas las sucursales de la promoción.
create or replace function app.require_promotion_scope(p_membership public.memberships, p_branch_ids uuid[])
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
    if not app.membership_covers_branch(p_membership, v_branch) then
      perform app.fail(403, 'branch_scope');
    end if;
  end loop;
end;
$$;

create or replace function app.promotion_branch_slugs(p_branch_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public_slug order by public_slug), '[]'::jsonb) from public.branches where id = any (p_branch_ids);
$$;

-- ---------------------------------------------------------------------------
-- Guardar (crear o editar)
-- ---------------------------------------------------------------------------
create or replace function public.save_promotion(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_business_id uuid := (p_payload ->> 'business_id')::uuid;
  v_existing public.promotions;
  v_membership public.memberships;
  v_kind text := p_payload ->> 'kind';
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_description text := btrim(coalesce(p_payload ->> 'description', ''));
  v_items jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
  v_clean_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_price bigint := app.jsonb_bigint(p_payload -> 'price_minor');
  v_starts date;
  v_ends date;
  v_days smallint[];
  v_start time;
  v_end time;
  v_branch_ids uuid[];
  v_old_branch_ids uuid[] := '{}';
  v_overlaps jsonb;
  v_earliest_today date;
begin
  perform app.require_user();
  if v_business_id is null then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_business_id, 'promotions.manage');
  perform app.require_active_business(v_business_id);

  if v_kind is null or v_kind not in ('daily_menu', 'promotion') then
    perform app.fail(422, 'invalid_promotion_kind');
  end if;
  if char_length(v_title) not between 2 and 80 then
    perform app.fail(422, 'invalid_promotion_title');
  end if;
  if char_length(v_description) > 400 then
    perform app.fail(422, 'description_too_long');
  end if;
  perform app.check_price(v_price, 'price_minor');
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 12 then
    perform app.fail(422, 'invalid_promotion_items');
  end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'string' or char_length(btrim(v_item #>> '{}')) not between 1 and 120 then
      perform app.fail(422, 'invalid_promotion_items');
    end if;
    v_clean_items := v_clean_items || to_jsonb(btrim(v_item #>> '{}'));
  end loop;

  begin
    v_starts := (p_payload ->> 'starts_on')::date;
    v_ends := (p_payload ->> 'ends_on')::date;
    v_start := (p_payload ->> 'start_time')::time;
    v_end := (p_payload ->> 'end_time')::time;
    select array_agg(distinct (d #>> '{}')::smallint order by (d #>> '{}')::smallint)
      into v_days from jsonb_array_elements(coalesce(p_payload -> 'weekdays', '[]'::jsonb)) as d;
    select array_agg(distinct (b #>> '{}')::uuid) into v_branch_ids from jsonb_array_elements(coalesce(p_payload -> 'branch_ids', '[]'::jsonb)) as b;
  exception
    when others then
      perform app.fail(422, 'invalid_promotion_schedule');
  end;
  if v_starts is null or v_ends is null or v_start is null or v_end is null or v_ends < v_starts or v_ends - v_starts > 366 then
    perform app.fail(422, 'invalid_promotion_schedule');
  end if;
  if v_end <= v_start then
    perform app.fail(422, 'promotion_time_order');
  end if;
  if v_days is null or not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
    perform app.fail(422, 'invalid_promotion_schedule');
  end if;
  if not exists (
    select 1 from generate_series(v_starts::timestamp, least(v_ends, v_starts + 6)::timestamp, interval '1 day') as d(day)
    where extract(dow from d.day)::smallint = any (v_days)
  ) then
    perform app.fail(422, 'promotion_no_dates');
  end if;
  if v_branch_ids is null or cardinality(v_branch_ids) = 0 then
    perform app.fail(422, 'branches_required');
  end if;
  if exists (select 1 from unnest(v_branch_ids) as x(id)
             where not exists (select 1 from public.branches b where b.id = x.id and b.business_id = v_business_id)) then
    perform app.fail(422, 'invalid_branch');
  end if;
  perform app.require_promotion_scope(v_membership, v_branch_ids);

  -- No tiene sentido programar algo que ya terminó en todas sus sucursales.
  select min((now() at time zone b.timezone)::date) into v_earliest_today from public.branches b where b.id = any (v_branch_ids);
  if v_ends < v_earliest_today and v_id is null then
    perform app.fail(422, 'promotion_in_past');
  end if;

  if v_id is not null then
    select * into v_existing from public.promotions where id = v_id and business_id = v_business_id for update;
    if not found then
      perform app.fail(404, 'not_found');
    end if;
    select coalesce(array_agg(branch_id), '{}') into v_old_branch_ids from public.promotion_branches where promotion_id = v_id;
    perform app.require_promotion_scope(v_membership, v_old_branch_ids);
    if (p_payload ? 'expected_revision') and (p_payload ->> 'expected_revision')::int <> v_existing.revision then
      perform app.fail(409, 'revision_conflict');
    end if;
    if v_existing.kind <> v_kind then
      perform app.fail(422, 'invalid_promotion_kind');
    end if;
  end if;

  v_overlaps := app.promotion_overlaps(v_business_id, v_id, v_kind, v_branch_ids, v_starts, v_ends, v_days, v_start, v_end);
  if v_kind = 'daily_menu' and jsonb_array_length(v_overlaps) > 0 and not coalesce(v_existing.paused, false) then
    perform app.fail(409, 'daily_menu_overlap', v_overlaps -> 0 ->> 'title');
  end if;

  if v_id is null then
    insert into public.promotions (business_id, kind, title, description, items, price_minor, starts_on, ends_on, weekdays,
                                   start_time, end_time, created_by, updated_by)
    values (v_business_id, v_kind, v_title, v_description, v_clean_items, v_price, v_starts, v_ends, v_days,
            v_start, v_end, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.promotions
    set title = v_title, description = v_description, items = v_clean_items, price_minor = v_price,
        starts_on = v_starts, ends_on = v_ends, weekdays = v_days, start_time = v_start, end_time = v_end,
        revision = revision + 1, updated_by = auth.uid()
    where id = v_id;
    delete from public.promotion_branches where promotion_id = v_id;
  end if;
  insert into public.promotion_branches (business_id, promotion_id, branch_id)
  select v_business_id, v_id, x from unnest(v_branch_ids) as x;

  perform app.audit(v_business_id,
    case when v_existing.id is null then 'promotion.created' else 'promotion.updated' end,
    'promotion', v_id,
    case when v_existing.id is null then 'Programó ' else 'Editó ' end
      || case when v_kind = 'daily_menu' then 'el menú del día «' else 'la promoción «' end || v_title || '»',
    jsonb_build_object('starts_on', v_starts, 'ends_on', v_ends, 'branches', v_branch_ids));

  return jsonb_build_object(
    'id', v_id,
    'overlaps', v_overlaps,
    'branch_slugs', app.promotion_branch_slugs(v_branch_ids || v_old_branch_ids)
  );
end;
$$;

create or replace function public.set_promotion_paused(p_promotion_id uuid, p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.promotions;
  v_membership public.memberships;
  v_branch_ids uuid[];
  v_overlaps jsonb;
begin
  perform app.require_user();
  select * into v_promotion from public.promotions where id = p_promotion_id for update;
  if not found or not app.is_member(v_promotion.business_id) then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_promotion.business_id, 'promotions.manage');
  perform app.require_active_business(v_promotion.business_id);
  select coalesce(array_agg(branch_id), '{}') into v_branch_ids from public.promotion_branches where promotion_id = v_promotion.id;
  perform app.require_promotion_scope(v_membership, v_branch_ids);
  if not coalesce(p_paused, false) and v_promotion.kind = 'daily_menu' then
    v_overlaps := app.promotion_overlaps(v_promotion.business_id, v_promotion.id, v_promotion.kind, v_branch_ids,
      v_promotion.starts_on, v_promotion.ends_on, v_promotion.weekdays, v_promotion.start_time, v_promotion.end_time);
    if jsonb_array_length(v_overlaps) > 0 then
      perform app.fail(409, 'daily_menu_overlap', v_overlaps -> 0 ->> 'title');
    end if;
  end if;
  if v_promotion.paused is distinct from coalesce(p_paused, false) then
    update public.promotions set paused = coalesce(p_paused, false), revision = revision + 1, updated_by = auth.uid()
    where id = v_promotion.id;
    perform app.audit(v_promotion.business_id, case when p_paused then 'promotion.paused' else 'promotion.resumed' end,
      'promotion', v_promotion.id,
      case when p_paused then 'Pausó «' else 'Reanudó «' end || v_promotion.title || '»');
  end if;
  return jsonb_build_object('branch_slugs', app.promotion_branch_slugs(v_branch_ids));
end;
$$;

create or replace function public.delete_promotion(p_promotion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.promotions;
  v_membership public.memberships;
  v_branch_ids uuid[];
begin
  perform app.require_user();
  select * into v_promotion from public.promotions where id = p_promotion_id for update;
  if not found or not app.is_member(v_promotion.business_id) then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_promotion.business_id, 'promotions.manage');
  perform app.require_active_business(v_promotion.business_id);
  select coalesce(array_agg(branch_id), '{}') into v_branch_ids from public.promotion_branches where promotion_id = v_promotion.id;
  perform app.require_promotion_scope(v_membership, v_branch_ids);
  delete from public.promotions where id = v_promotion.id;
  perform app.audit(v_promotion.business_id, 'promotion.deleted', 'promotion', v_promotion.id,
    'Eliminó «' || v_promotion.title || '»');
  return jsonb_build_object('branch_slugs', app.promotion_branch_slugs(v_branch_ids));
end;
$$;

-- Listado para el panel con las superposiciones de cada una.
create or replace function public.list_promotions(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_member(p_business_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
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
      'end_time', to_char(p.end_time, 'HH24:MI'),
      'paused', p.paused,
      'revision', p.revision,
      'updated_at', p.updated_at,
      'branch_ids', (select coalesce(jsonb_agg(pb.branch_id), '[]'::jsonb) from public.promotion_branches pb where pb.promotion_id = p.id),
      'overlaps', case when p.paused then '[]'::jsonb else app.promotion_overlaps(p.business_id, p.id, p.kind,
        (select array_agg(pb.branch_id) from public.promotion_branches pb where pb.promotion_id = p.id),
        p.starts_on, p.ends_on, p.weekdays, p.start_time, p.end_time) end
    ) order by p.ends_on desc, p.starts_on desc, p.title)
    from public.promotions p
    where p.business_id = p_business_id
      -- Solo las que incluyen alguna sucursal visible para la persona.
      and exists (
        select 1 from public.promotion_branches pb
        where pb.promotion_id = p.id and app.can_access_branch(p.business_id, pb.branch_id)
      )
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Carta pública: agrega las promociones vigentes alrededor de hoy (la página
-- decide cuáles mostrar con la hora actual, así la caché no queda vieja).
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

revoke all on function public.save_promotion(jsonb) from public, anon;
revoke all on function public.set_promotion_paused(uuid, boolean) from public, anon;
revoke all on function public.delete_promotion(uuid) from public, anon;
revoke all on function public.list_promotions(uuid) from public, anon;
grant execute on function public.save_promotion(jsonb) to authenticated, service_role;
grant execute on function public.set_promotion_paused(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_promotion(uuid) to authenticated, service_role;
grant execute on function public.list_promotions(uuid) to authenticated, service_role;
-- get_public_menu se reemplazó: conserva sus permisos (anon y authenticated).
grant execute on function public.get_public_menu(text) to anon, authenticated, service_role;
