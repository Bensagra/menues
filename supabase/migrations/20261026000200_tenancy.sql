-- CartaLista · Multitenancy
-- Negocio (cuenta comercial) · Sucursal (local físico) · Usuario (persona) ·
-- Membresía (usuario + negocio + rol + sucursales autorizadas).
--
-- Invariante: ninguna fila referencia entidades de otro negocio. Se garantiza con
-- claves foráneas compuestas (business_id, id).

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create or replace function app.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      lower(coalesce(new.email, '')),
      left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120)
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update of email on auth.users
  for each row execute function app.handle_auth_user_change();

-- ---------------------------------------------------------------------------
-- Administradores de plataforma
-- Solo se asignan con service role (script `npm run admin:grant`) o desde el
-- editor SQL. Nunca desde la aplicación.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by text not null check (char_length(granted_by) between 1 and 200),
  note text not null default '' check (char_length(note) <= 300)
);

-- ---------------------------------------------------------------------------
-- Planes (asignación manual; no hay cobros en esta etapa)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  max_branches int not null check (max_branches between 1 and 1000),
  max_members int not null check (max_members between 1 and 1000),
  max_menus int not null check (max_menus between 1 and 1000),
  ai_pages_per_month int not null check (ai_pages_per_month between 0 and 100000),
  ai_max_pages_per_import int not null check (ai_max_pages_per_import between 1 and 30),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or is_active)
);

create unique index plans_single_default on public.plans (is_default) where is_default;
create trigger plans_touch before update on public.plans
  for each row execute function app.touch_updated_at();

-- Datos de referencia necesarios también en producción.
insert into public.plans (code, name, description, max_branches, max_members, max_menus, ai_pages_per_month, ai_max_pages_per_import, is_default)
values
  ('inicial', 'Inicial', 'Para empezar: hasta 2 sucursales y 40 fotos procesadas por mes.', 2, 5, 5, 40, 6, true),
  ('profesional', 'Profesional', 'Para locales con más movimiento.', 5, 15, 15, 200, 10, false),
  ('cadena', 'Cadena', 'Para grupos con muchas sucursales.', 50, 100, 50, 1000, 20, false);

-- ---------------------------------------------------------------------------
-- Negocios
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (app.is_valid_slug(slug)),
  description text not null default '' check (char_length(description) <= 300),
  currency text not null default 'ARS' check (app.currency_exponent(currency) is not null),
  locale text not null default 'es-AR' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  brand_color text check (brand_color is null or app.is_legible_brand_color(brand_color)),
  logo_media_id uuid,
  cover_media_id uuid,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_at timestamptz,
  suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 300),
  suspended_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'suspended') = (suspended_at is not null))
);

create trigger businesses_touch before update on public.businesses
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sucursales
-- public_slug es la URL permanente de la carta (/m/<public_slug>) y del QR:
-- no se puede modificar una vez creada.
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  public_slug text not null unique check (app.is_valid_slug(public_slug)),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  address text not null default '' check (char_length(address) <= 200),
  phone text not null default '' check (char_length(phone) <= 40),
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^\+?[0-9]{8,15}$'),
  public_note text not null default '' check (char_length(public_note) <= 300),
  opening_hours jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create index branches_business on public.branches (business_id, sort_order);

-- Horarios: [{"day":0-6 (0=domingo), "open":"HH:MM", "close":"HH:MM"}]
-- close < open significa que cierra después de medianoche.
create or replace function app.is_valid_opening_hours(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 28 then
    return false;
  end if;
  for v_item in select * from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select count(*) from jsonb_object_keys(v_item)) <> 3
       or jsonb_typeof(v_item -> 'day') <> 'number'
       or (v_item ->> 'day') !~ '^[0-6]$'
       or coalesce(v_item ->> 'open', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v_item ->> 'close', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_item ->> 'open' = v_item ->> 'close' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.branches
  add constraint branches_opening_hours_valid check (app.is_valid_opening_hours(opening_hours));

create or replace function app.branches_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    perform app.fail(422, 'invalid_timezone');
  end if;
  if tg_op = 'UPDATE' then
    if new.public_slug is distinct from old.public_slug then
      perform app.fail(422, 'public_slug_immutable');
    end if;
    if new.business_id is distinct from old.business_id then
      perform app.fail(422, 'business_immutable');
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger branches_guard before insert or update on public.branches
  for each row execute function app.branches_guard();

-- ---------------------------------------------------------------------------
-- Membresías
-- owner/admin siempre tienen todas las sucursales y permiso de publicar.
-- editor: sucursales asignadas (o todas) y publicación solo con can_publish.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  can_publish boolean not null default false,
  all_branches boolean not null default false,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  unique (business_id, user_id),
  unique (business_id, id),
  check (role = 'editor' or (can_publish and all_branches)),
  check ((status = 'revoked') = (revoked_at is not null))
);

create index memberships_user on public.memberships (user_id) where status = 'active';
create trigger memberships_touch before update on public.memberships
  for each row execute function app.touch_updated_at();

create table public.membership_branches (
  business_id uuid not null,
  membership_id uuid not null,
  branch_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, branch_id),
  foreign key (business_id, membership_id) references public.memberships (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

create index membership_branches_branch on public.membership_branches (branch_id);

-- ---------------------------------------------------------------------------
-- Invitaciones: atadas a un email, con vencimiento y de un solo uso.
-- Se guarda solo el hash del token.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 254
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  role text not null check (role in ('owner', 'admin', 'editor')),
  can_publish boolean not null default false,
  all_branches boolean not null default false,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_platform boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  unique (business_id, id),
  check (role = 'editor' or (can_publish and all_branches)),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create unique index invitations_one_open on public.invitations (business_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_email on public.invitations (email) where accepted_at is null and revoked_at is null;

create table public.invitation_branches (
  business_id uuid not null,
  invitation_id uuid not null,
  branch_id uuid not null,
  primary key (invitation_id, branch_id),
  foreign key (business_id, invitation_id) references public.invitations (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Plan asignado (historial; una sola asignación vigente por negocio)
-- ---------------------------------------------------------------------------
create table public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by uuid references auth.users (id) on delete set null,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create unique index plan_assignments_current on public.plan_assignments (business_id) where ends_at is null;

-- ---------------------------------------------------------------------------
-- Consumo de IA por negocio y mes (UTC). pages_reserved cubre trabajos en curso:
-- reservado + usado nunca supera el límite del plan.
-- ---------------------------------------------------------------------------
create table public.ai_usage_months (
  business_id uuid not null references public.businesses (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  pages_reserved int not null default 0 check (pages_reserved >= 0),
  pages_used int not null default 0 check (pages_used >= 0),
  imports_completed int not null default 0 check (imports_completed >= 0),
  imports_failed int not null default 0 check (imports_failed >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd_ticks bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, month)
);

-- ---------------------------------------------------------------------------
-- Auditoría (solo inserción, desde funciones del servidor)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete set null,
  branch_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'platform_admin', 'system', 'worker')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text,
  entity_id uuid,
  summary text not null default '' check (char_length(summary) <= 500),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_business on public.audit_log (business_id, created_at desc);
create index audit_log_created on public.audit_log (created_at desc);

create or replace function app.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.fail(403, 'audit_log_immutable');
  return null;
end;
$$;

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function app.audit_log_immutable();

create or replace function app.audit(
  p_business_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_details jsonb default '{}'::jsonb,
  p_branch_id uuid default null,
  p_actor_id uuid default null,
  p_actor_kind text default 'user'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (business_id, branch_id, actor_id, actor_kind, action, entity_type, entity_id, summary, details)
  values (
    p_business_id,
    p_branch_id,
    coalesce(p_actor_id, auth.uid()),
    p_actor_kind,
    p_action,
    p_entity_type,
    p_entity_id,
    left(coalesce(p_summary, ''), 500),
    coalesce(p_details, '{}'::jsonb)
  );
$$;
