-- CartaLista · Estadísticas de consulta de la carta pública
--
-- Solo se guardan contadores agregados por sucursal, día y hora local de la
-- sucursal: sin IP, sin user agent, sin cookies ni identificadores de
-- visitantes. Una "consulta de producto" significa que alguien abrió su detalle:
-- indica interés, no una venta.
--
-- El conteo lo hace el servidor (POST /api/track) con service role, después de
-- descartar bots y el tráfico del propio equipo o de la plataforma.

create table public.stats_branch_hourly (
  business_id uuid not null,
  branch_id uuid not null,
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  menu_views int not null default 0 check (menu_views >= 0),
  product_views int not null default 0 check (product_views >= 0),
  searches int not null default 0 check (searches >= 0),
  primary key (branch_id, day, hour),
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

create index stats_branch_hourly_business on public.stats_branch_hourly (business_id, day);

create table public.stats_product_daily (
  business_id uuid not null,
  branch_id uuid not null,
  day date not null,
  product_id uuid not null,
  views int not null default 0 check (views >= 0),
  primary key (branch_id, day, product_id),
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade,
  foreign key (business_id, product_id) references public.products (business_id, id) on delete cascade
);

create index stats_product_daily_product on public.stats_product_daily (product_id);

alter table public.stats_branch_hourly enable row level security;
alter table public.stats_product_daily enable row level security;

create policy stats_branch_hourly_select on public.stats_branch_hourly for select to authenticated
  using (app.has_permission(business_id, 'stats.view') and app.can_access_branch(business_id, branch_id));

create policy stats_product_daily_select on public.stats_product_daily for select to authenticated
  using (app.has_permission(business_id, 'stats.view') and app.can_access_branch(business_id, branch_id));

grant select on public.stats_branch_hourly, public.stats_product_daily to authenticated;

-- ---------------------------------------------------------------------------
-- Registro de un evento (solo service role, desde /api/track)
-- Devuelve un código de resultado; nunca falla por datos del visitante.
-- ---------------------------------------------------------------------------
create or replace function public.server_track_event(p_slug text, p_event text, p_product_id uuid, p_viewer_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_local timestamp;
begin
  if p_event is null or p_event not in ('menu_view', 'product_view', 'search') then
    return 'invalid_event';
  end if;

  select b.* into v_branch
  from public.branches b
  join public.businesses biz on biz.id = b.business_id
  where b.public_slug = p_slug and b.is_active and biz.status = 'active';
  if not found then
    return 'not_found';
  end if;

  -- El equipo del negocio y la plataforma no suman visitas.
  if p_viewer_id is not null and (
    exists (
      select 1 from public.memberships m
      where m.business_id = v_branch.business_id and m.user_id = p_viewer_id and m.status = 'active'
    )
    or exists (select 1 from public.platform_admins a where a.user_id = p_viewer_id)
  ) then
    return 'skipped';
  end if;

  if not exists (
    select 1 from public.menu_branches mb
    where mb.branch_id = v_branch.id and mb.published_version_id is not null
  ) then
    return 'unpublished';
  end if;

  v_local := now() at time zone v_branch.timezone;

  if p_event = 'product_view' then
    -- Solo productos de una carta publicada en esta sucursal.
    if p_product_id is null or not exists (
      select 1
      from public.products p
      join public.menu_branches mb on mb.menu_id = p.menu_id
      where p.id = p_product_id
        and p.business_id = v_branch.business_id
        and mb.branch_id = v_branch.id
        and mb.published_version_id is not null
    ) then
      return 'invalid_product';
    end if;
    insert into public.stats_product_daily (business_id, branch_id, day, product_id, views)
    values (v_branch.business_id, v_branch.id, v_local::date, p_product_id, 1)
    on conflict (branch_id, day, product_id) do update set views = public.stats_product_daily.views + 1;
  end if;

  insert into public.stats_branch_hourly (business_id, branch_id, day, hour, menu_views, product_views, searches)
  values (
    v_branch.business_id, v_branch.id, v_local::date, extract(hour from v_local)::smallint,
    (p_event = 'menu_view')::int, (p_event = 'product_view')::int, (p_event = 'search')::int
  )
  on conflict (branch_id, day, hour) do update set
    menu_views = public.stats_branch_hourly.menu_views + excluded.menu_views,
    product_views = public.stats_branch_hourly.product_views + excluded.product_views,
    searches = public.stats_branch_hourly.searches + excluded.searches;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumen para el panel: período actual, período anterior de igual largo,
-- serie diaria, distribución por hora y productos más consultados.
-- Los días y las horas están en la zona horaria de la sucursal.
-- ---------------------------------------------------------------------------
create or replace function public.get_branch_stats(p_branch_id uuid, p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
  v_days int := least(greatest(coalesce(p_days, 30), 1), 366);
  v_today date;
  v_start date;
  v_prev_start date;
begin
  perform app.require_user();
  select * into v_branch from public.branches where id = p_branch_id;
  if not found or not app.can_access_branch(v_branch.business_id, v_branch.id) then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_branch.business_id, 'stats.view');

  v_today := (now() at time zone v_branch.timezone)::date;
  v_start := v_today - (v_days - 1);
  v_prev_start := v_start - v_days;

  return jsonb_build_object(
    'timezone', v_branch.timezone,
    'today', v_today,
    'start', v_start,
    'days', v_days,
    'totals', (
      select jsonb_build_object(
        'menu_views', coalesce(sum(s.menu_views), 0),
        'product_views', coalesce(sum(s.product_views), 0),
        'searches', coalesce(sum(s.searches), 0))
      from public.stats_branch_hourly s
      where s.branch_id = v_branch.id and s.day between v_start and v_today
    ),
    'previous', (
      select jsonb_build_object(
        'menu_views', coalesce(sum(s.menu_views), 0),
        'product_views', coalesce(sum(s.product_views), 0),
        'searches', coalesce(sum(s.searches), 0),
        'has_data', count(*) > 0)
      from public.stats_branch_hourly s
      where s.branch_id = v_branch.id and s.day between v_prev_start and v_start - 1
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day::date,
        'menu_views', coalesce(s.menu_views, 0),
        'product_views', coalesce(s.product_views, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_start::timestamp, v_today::timestamp, interval '1 day') as d(day)
      left join (
        select x.day, sum(x.menu_views) as menu_views, sum(x.product_views) as product_views
        from public.stats_branch_hourly x
        where x.branch_id = v_branch.id and x.day between v_start and v_today
        group by x.day
      ) s on s.day = d.day::date
    ),
    'hourly', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'menu_views', coalesce(s.menu_views, 0)) order by h.hour), '[]'::jsonb)
      from generate_series(0, 23) as h(hour)
      left join (
        select x.hour, sum(x.menu_views) as menu_views
        from public.stats_branch_hourly x
        where x.branch_id = v_branch.id and x.day between v_start and v_today
        group by x.hour
      ) s on s.hour = h.hour
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_id', t.product_id,
        'name', p.name,
        'category', c.name,
        'archived', p.archived_at is not null,
        'views', t.views) order by t.views desc, p.name), '[]'::jsonb)
      from (
        select x.product_id, sum(x.views)::int as views
        from public.stats_product_daily x
        where x.branch_id = v_branch.id and x.day between v_start and v_today
        group by x.product_id
        order by 2 desc
        limit 10
      ) t
      join public.products p on p.id = t.product_id
      left join public.categories c on c.id = p.category_id
    )
  );
end;
$$;

revoke all on function public.server_track_event(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_track_event(text, text, uuid, uuid) to service_role;
revoke all on function public.get_branch_stats(uuid, int) from public, anon;
grant execute on function public.get_branch_stats(uuid, int) to authenticated, service_role;
