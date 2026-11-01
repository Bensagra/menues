-- CartaLista · Catálogo editable, versiones publicadas
--
-- Relación entre catálogo, borrador y versiones:
--   * El catálogo editable (menus, categories, products, variants, extras y
--     overrides por sucursal) ES el borrador. Guardar cambia el borrador.
--   * Publicar genera, por cada sucursal seleccionada, una instantánea JSON
--     inmutable (menu_versions.snapshot) con precios y disponibilidad ya
--     resueltos para esa sucursal, y mueve el puntero
--     menu_branches.published_version_id en la misma transacción.
--   * El menú público solo lee instantáneas apuntadas por ese puntero.
--   * Archivar productos o borrar categorías no afecta versiones históricas,
--     porque las instantáneas no dependen de filas vivas.

-- ---------------------------------------------------------------------------
-- Medios públicos (fotos de productos, logo, portada) ya procesados.
-- ---------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('product_image', 'logo', 'cover')),
  bucket text not null default 'public-media' check (bucket = 'public-media'),
  path_sm text not null,
  path_lg text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  bytes int not null check (bytes > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (path_lg),
  unique (path_sm)
);

alter table public.businesses
  add constraint businesses_logo_fk foreign key (id, logo_media_id) references public.media (business_id, id),
  add constraint businesses_cover_fk foreign key (id, cover_media_id) references public.media (business_id, id);

-- ---------------------------------------------------------------------------
-- Menús (cartas)
-- ---------------------------------------------------------------------------
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  kind text not null default 'regular' check (kind in ('regular', 'daily')),
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  unique (business_id, id),
  check ((status = 'archived') = (archived_at is not null))
);

create index menus_business on public.menus (business_id, status, sort_order);
create trigger menus_touch before update on public.menus
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  name_key text generated always as (app.name_key(name)) stored,
  description text not null default '' check (char_length(description) <= 300),
  sort_order int not null default 0,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (menu_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

create unique index categories_unique_name on public.categories (menu_id, name_key);
create index categories_menu on public.categories (menu_id, sort_order);
-- revision la incrementan explícitamente las RPC que cambian contenido (no el orden).
create trigger categories_touch before update on public.categories
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Productos
-- price_minor: importe en unidades menores de la moneda del negocio. null =
-- sin precio base (por ejemplo, precio solo en variantes).
-- tags: solo etiquetas confirmadas por el restaurante. Nunca se infieren.
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  category_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_key text generated always as (app.name_key(name)) stored,
  description text not null default '' check (char_length(description) <= 600),
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000000),
  status text not null default 'available' check (status in ('available', 'sold_out', 'hidden')),
  tags text[] not null default '{}' check (
    tags <@ array['vegetariano', 'vegano', 'sin_tacc', 'sin_lactosa', 'picante', 'nuevo', 'recomendado', 'para_compartir']::text[]
  ),
  image_media_id uuid,
  sort_order int not null default 0,
  revision int not null default 1,
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  unique (menu_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (menu_id, category_id) references public.categories (menu_id, id),
  foreign key (business_id, image_media_id) references public.media (business_id, id)
);

create unique index products_unique_name on public.products (category_id, name_key) where archived_at is null;
create index products_menu on public.products (menu_id, category_id, sort_order) where archived_at is null;
create index products_menu_all on public.products (menu_id);
-- revision: control de concurrencia optimista. La incrementan las RPC que cambian
-- contenido del producto (incluidas variantes y extras), no el reordenamiento.
create trigger products_touch before update on public.products
  for each row execute function app.touch_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  name_key text generated always as (app.name_key(name)) stored,
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000000),
  sort_order int not null default 0,
  unique (business_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (menu_id, product_id) references public.products (menu_id, id) on delete cascade
);

create unique index product_variants_unique_name on public.product_variants (product_id, name_key);

create table public.product_extras (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  product_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  name_key text generated always as (app.name_key(name)) stored,
  price_minor bigint not null check (price_minor between 0 and 100000000000),
  sort_order int not null default 0,
  unique (business_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (menu_id, product_id) references public.products (menu_id, id) on delete cascade
);

create unique index product_extras_unique_name on public.product_extras (product_id, name_key);

-- ---------------------------------------------------------------------------
-- Sucursales donde se muestra cada menú + puntero a la versión publicada.
-- ---------------------------------------------------------------------------
create table public.menu_branches (
  business_id uuid not null,
  menu_id uuid not null,
  branch_id uuid not null,
  sort_order int not null default 0,
  published_version_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (menu_id, branch_id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

create index menu_branches_branch on public.menu_branches (branch_id, sort_order);

-- Precio y disponibilidad específicos por sucursal (catálogo compartido).
create table public.product_branch_overrides (
  business_id uuid not null,
  menu_id uuid not null,
  product_id uuid not null,
  branch_id uuid not null,
  price_minor bigint check (price_minor is null or price_minor between 0 and 100000000000),
  status text check (status is null or status in ('available', 'sold_out', 'hidden')),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (product_id, branch_id),
  foreign key (menu_id, product_id) references public.products (menu_id, id) on delete cascade,
  foreign key (menu_id, branch_id) references public.menu_branches (menu_id, branch_id) on delete cascade,
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  check (price_minor is not null or status is not null)
);

create table public.variant_branch_prices (
  business_id uuid not null,
  menu_id uuid not null,
  variant_id uuid not null,
  branch_id uuid not null,
  price_minor bigint not null check (price_minor between 0 and 100000000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (variant_id, branch_id),
  foreign key (business_id, variant_id) references public.product_variants (business_id, id) on delete cascade,
  foreign key (menu_id, branch_id) references public.menu_branches (menu_id, branch_id) on delete cascade,
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Publicaciones y versiones (inmutables)
-- ---------------------------------------------------------------------------
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  menu_id uuid not null,
  source text not null check (source in ('manual', 'import', 'restore', 'bulk_price')),
  import_id uuid,
  restored_from_version_id uuid,
  idempotency_key uuid not null,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  note text not null default '' check (char_length(note) <= 300),
  unique (business_id, idempotency_key),
  unique (business_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

create index publications_menu on public.publications (menu_id, published_at desc);
create index publications_business on public.publications (business_id, published_at desc);

create table public.menu_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  branch_id uuid not null,
  publication_id uuid not null,
  version_number int not null check (version_number > 0),
  snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  product_count int not null check (product_count >= 0),
  change_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (menu_id, branch_id, version_number),
  unique (menu_id, branch_id, id),
  unique (business_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade,
  foreign key (business_id, publication_id) references public.publications (business_id, id) on delete cascade
);

create index menu_versions_publication on public.menu_versions (publication_id);

alter table public.menu_branches
  add constraint menu_branches_version_fk
  foreign key (menu_id, branch_id, published_version_id)
  references public.menu_versions (menu_id, branch_id, id);

alter table public.publications
  add constraint publications_restored_from_fk
  foreign key (business_id, restored_from_version_id) references public.menu_versions (business_id, id);

create or replace function app.versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.fail(403, 'version_immutable');
  return null;
end;
$$;

create trigger menu_versions_no_update before update on public.menu_versions
  for each row execute function app.versions_immutable();
create trigger publications_no_update before update on public.publications
  for each row execute function app.versions_immutable();
