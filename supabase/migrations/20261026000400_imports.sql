-- CartaLista · Importaciones con fotos
-- La tabla imports es también la cola de trabajos del worker: el estado es
-- persistente, sobrevive al cierre del navegador y a reinicios del worker.
--
-- Estados visibles: pending (pendiente) → processing (procesando) →
-- needs_review (requiere revisión) → completed (completado). También failed
-- (fallido) y cancelled (cancelado). 'uploading' es interno: las fotos todavía
-- se están subiendo y el trabajo no entró a la cola.

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  menu_id uuid not null,
  scope text not null check (scope in ('full', 'categories', 'prices_only')),
  status text not null default 'uploading' check (
    status in ('uploading', 'pending', 'processing', 'needs_review', 'completed', 'failed', 'cancelled')
  ),
  stage text not null default 'uploading' check (
    stage in ('uploading', 'queued', 'preparing', 'reading', 'comparing', 'ready', 'applied', 'failed', 'cancelled', 'retry_wait')
  ),
  stage_page int,
  idempotency_key uuid not null,
  images_hash text check (images_hash is null or images_hash ~ '^[0-9a-f]{64}$'),
  page_count int not null default 0 check (page_count between 0 and 30),
  attempts int not null default 0 check (attempts >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  locked_by text,
  locked_until timestamptz,
  lock_token uuid,
  provider text,
  model text,
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  quota_month date,
  quota_reserved_pages int not null default 0 check (quota_reserved_pages >= 0),
  quota_settled boolean not null default false,
  usage jsonb not null default '{}'::jsonb,
  extraction jsonb,
  base_menu_state jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  completed_at timestamptz,
  applied_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  failed_at timestamptz,
  unique (business_id, idempotency_key),
  unique (business_id, id),
  unique (menu_id, id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  check ((status = 'processing') = (lock_token is not null))
);

create index imports_queue on public.imports (next_attempt_at) where status = 'pending';
create index imports_leases on public.imports (locked_until) where status = 'processing';
create index imports_business on public.imports (business_id, created_at desc);
create index imports_menu on public.imports (menu_id, created_at desc);

create trigger imports_touch before update on public.imports
  for each row execute function app.touch_updated_at();

alter table public.publications
  add constraint publications_import_fk foreign key (business_id, import_id) references public.imports (business_id, id);

-- Sucursales a las que aplica la importación.
create table public.import_branches (
  business_id uuid not null,
  import_id uuid not null,
  branch_id uuid not null,
  primary key (import_id, branch_id),
  foreign key (business_id, import_id) references public.imports (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

-- Categorías elegidas cuando el alcance es 'categories'.
create table public.import_categories (
  business_id uuid not null,
  menu_id uuid not null,
  import_id uuid not null,
  category_id uuid not null,
  primary key (import_id, category_id),
  foreign key (menu_id, import_id) references public.imports (menu_id, id) on delete cascade,
  foreign key (menu_id, category_id) references public.categories (menu_id, id) on delete cascade,
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

-- Fotos originales (privadas, bucket import-originals).
create table public.import_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  import_id uuid not null,
  page_number int not null check (page_number between 1 and 30),
  storage_path text not null unique,
  original_name text not null default '' check (char_length(original_name) <= 200),
  declared_type text not null check (declared_type in ('image/jpeg', 'image/png', 'image/webp')),
  declared_bytes int not null check (declared_bytes > 0),
  detected_format text check (detected_format is null or detected_format in ('jpeg', 'png', 'webp')),
  bytes int check (bytes is null or bytes > 0),
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  rotation int not null default 0 check (rotation in (0, 90, 180, 270)),
  status text not null default 'awaiting_upload' check (status in ('awaiting_upload', 'ready', 'extracted', 'failed')),
  extraction jsonb,
  extracted_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (menu_id, import_id) references public.imports (menu_id, id) on delete cascade,
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

-- Diferible: permite reordenar páginas dentro de una transacción.
alter table public.import_images
  add constraint import_images_page unique (import_id, page_number) deferrable initially deferred;

-- Propuestas de cambio generadas a partir de la extracción.
create table public.import_proposals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  menu_id uuid not null,
  import_id uuid not null,
  position int not null check (position >= 0),
  kind text not null check (kind in (
    'new_category', 'new_product', 'price_change', 'name_change', 'description_change',
    'variant_change', 'possible_duplicate', 'uncertain_match', 'illegible', 'no_change', 'not_found'
  )),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'conflict', 'skipped')),
  needs_review boolean not null default false,
  applicable boolean not null default true,
  product_id uuid,
  category_id uuid,
  new_category_ref text,
  base_revision int,
  page_number int,
  current_value jsonb,
  detected_value jsonb not null default '{}'::jsonb,
  proposed_value jsonb,
  corrected boolean not null default false,
  flags text[] not null default '{}',
  reason text not null default '' check (char_length(reason) <= 500),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, position),
  unique (business_id, id),
  foreign key (menu_id, import_id) references public.imports (menu_id, id) on delete cascade,
  foreign key (menu_id, product_id) references public.products (menu_id, id),
  foreign key (menu_id, category_id) references public.categories (menu_id, id) on delete set null (category_id),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade
);

create index import_proposals_import on public.import_proposals (import_id, position);

create trigger import_proposals_touch before update on public.import_proposals
  for each row execute function app.touch_updated_at();

-- Latidos del worker: permiten mostrar si el procesador está activo.
create table public.worker_heartbeats (
  worker_id text primary key check (char_length(worker_id) between 1 and 120),
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  provider text not null,
  model text,
  ai_configured boolean not null,
  version text
);
