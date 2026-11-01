-- CartaLista · RPC del catálogo, instantáneas, publicación y restauración

-- ---------------------------------------------------------------------------
-- Validaciones compartidas
-- ---------------------------------------------------------------------------
create or replace function app.check_price(p_value bigint, p_field text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is not null and (p_value < 0 or p_value > 100000000000) then
    perform app.fail(422, 'invalid_price', p_field);
  end if;
end;
$$;

create or replace function app.jsonb_bigint(p_value jsonb)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^-?[0-9]+$' then
    perform app.fail(422, 'invalid_amount');
  end if;
  return (p_value #>> '{}')::bigint;
end;
$$;

create or replace function app.menu_branch_slugs(p_menu_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(b.public_slug order by b.public_slug), '[]'::jsonb)
  from public.menu_branches mb
  join public.branches b on b.id = mb.branch_id
  where mb.menu_id = p_menu_id;
$$;

-- ---------------------------------------------------------------------------
-- Menús
-- ---------------------------------------------------------------------------
create or replace function public.create_menu(
  p_business_id uuid,
  p_name text,
  p_description text,
  p_branch_ids uuid[],
  p_kind text default 'regular'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_count int;
  v_menu_id uuid;
  v_ids uuid[] := coalesce((select array_agg(distinct x) from unnest(p_branch_ids) x where x is not null), '{}');
begin
  perform app.require_permission(p_business_id, 'menus.manage');
  perform app.require_active_business(p_business_id);
  if p_kind not in ('regular', 'daily') then
    perform app.fail(422, 'invalid_kind');
  end if;
  v_plan := app.current_plan(p_business_id);
  select count(*) into v_count from public.menus where business_id = p_business_id and status = 'active';
  if v_count >= v_plan.max_menus then
    perform app.fail(422, 'plan_limit_menus', v_plan.max_menus::text);
  end if;
  if (select count(*) from public.branches where business_id = p_business_id and id = any (v_ids)) <> cardinality(v_ids) then
    perform app.fail(422, 'invalid_branch');
  end if;

  insert into public.menus (business_id, name, description, kind, sort_order, created_by)
  values (
    p_business_id, btrim(p_name), btrim(coalesce(p_description, '')), p_kind,
    coalesce((select max(sort_order) + 1 from public.menus where business_id = p_business_id), 0), auth.uid()
  )
  returning id into v_menu_id;

  insert into public.menu_branches (business_id, menu_id, branch_id, sort_order)
  select p_business_id, v_menu_id, b, coalesce((select max(sort_order) + 1 from public.menu_branches where branch_id = b), 0)
  from unnest(v_ids) b;

  perform app.audit(p_business_id, 'menu.created', 'menu', v_menu_id, 'Creó la carta ' || btrim(p_name),
    jsonb_build_object('branch_ids', to_jsonb(v_ids)));
  return v_menu_id;
end;
$$;

create or replace function public.update_menu(p_menu_id uuid, p_name text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus := app.require_menu_edit(p_menu_id);
begin
  update public.menus
  set name = btrim(p_name), description = btrim(coalesce(p_description, ''))
  where id = p_menu_id;
  perform app.audit(v_menu.business_id, 'menu.updated', 'menu', p_menu_id, 'Renombró la carta a ' || btrim(p_name), '{}'::jsonb);
end;
$$;

create or replace function public.archive_menu(p_menu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_menu.business_id, 'menus.manage');
  perform app.require_active_business(v_menu.business_id);
  if v_menu.status = 'active' then
    update public.menus set status = 'archived', archived_at = now(), archived_by = auth.uid() where id = p_menu_id;
    perform app.audit(v_menu.business_id, 'menu.archived', 'menu', p_menu_id, 'Archivó la carta ' || v_menu.name, '{}'::jsonb);
  end if;
  return jsonb_build_object('branch_slugs', app.menu_branch_slugs(p_menu_id));
end;
$$;

create or replace function public.unarchive_menu(p_menu_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_plan public.plans;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_menu.business_id, 'menus.manage');
  perform app.require_active_business(v_menu.business_id);
  if v_menu.status = 'archived' then
    v_plan := app.current_plan(v_menu.business_id);
    if (select count(*) from public.menus where business_id = v_menu.business_id and status = 'active') >= v_plan.max_menus then
      perform app.fail(422, 'plan_limit_menus', v_plan.max_menus::text);
    end if;
    update public.menus set status = 'active', archived_at = null, archived_by = null where id = p_menu_id;
    perform app.audit(v_menu.business_id, 'menu.unarchived', 'menu', p_menu_id, 'Restauró la carta ' || v_menu.name, '{}'::jsonb);
  end if;
  return jsonb_build_object('branch_slugs', app.menu_branch_slugs(p_menu_id));
end;
$$;

create or replace function public.duplicate_menu(p_menu_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_plan public.plans;
  v_new_id uuid := gen_random_uuid();
  v_cat_map jsonb;
  v_prod_map jsonb;
  v_var_map jsonb;
begin
  select * into v_menu from public.menus where id = p_menu_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_menu.business_id, 'menus.manage');
  perform app.require_active_business(v_menu.business_id);
  v_plan := app.current_plan(v_menu.business_id);
  if (select count(*) from public.menus where business_id = v_menu.business_id and status = 'active') >= v_plan.max_menus then
    perform app.fail(422, 'plan_limit_menus', v_plan.max_menus::text);
  end if;

  insert into public.menus (id, business_id, name, description, kind, sort_order, created_by)
  values (
    v_new_id, v_menu.business_id, btrim(p_name), v_menu.description, v_menu.kind,
    coalesce((select max(sort_order) + 1 from public.menus where business_id = v_menu.business_id), 0), auth.uid()
  );

  insert into public.menu_branches (business_id, menu_id, branch_id, sort_order)
  select business_id, v_new_id, branch_id, sort_order + 1 from public.menu_branches where menu_id = p_menu_id;

  select coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) into v_cat_map
  from public.categories where menu_id = p_menu_id;
  insert into public.categories (id, business_id, menu_id, name, description, sort_order)
  select (v_cat_map ->> id::text)::uuid, business_id, v_new_id, name, description, sort_order
  from public.categories where menu_id = p_menu_id;

  select coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) into v_prod_map
  from public.products where menu_id = p_menu_id and archived_at is null;
  insert into public.products (
    id, business_id, menu_id, category_id, name, description, price_minor, status, tags, image_media_id,
    sort_order, created_by, updated_by
  )
  select (v_prod_map ->> id::text)::uuid, business_id, v_new_id, (v_cat_map ->> category_id::text)::uuid, name,
         description, price_minor, status, tags, image_media_id, sort_order, auth.uid(), auth.uid()
  from public.products where menu_id = p_menu_id and archived_at is null;

  select coalesce(jsonb_object_agg(v.id::text, gen_random_uuid()), '{}'::jsonb) into v_var_map
  from public.product_variants v where v.menu_id = p_menu_id and v_prod_map ? v.product_id::text;
  insert into public.product_variants (id, business_id, menu_id, product_id, name, price_minor, sort_order)
  select (v_var_map ->> v.id::text)::uuid, v.business_id, v_new_id, (v_prod_map ->> v.product_id::text)::uuid,
         v.name, v.price_minor, v.sort_order
  from public.product_variants v where v.menu_id = p_menu_id and v_prod_map ? v.product_id::text;

  insert into public.product_extras (business_id, menu_id, product_id, name, price_minor, sort_order)
  select e.business_id, v_new_id, (v_prod_map ->> e.product_id::text)::uuid, e.name, e.price_minor, e.sort_order
  from public.product_extras e where e.menu_id = p_menu_id and v_prod_map ? e.product_id::text;

  insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, price_minor, status, updated_by)
  select o.business_id, v_new_id, (v_prod_map ->> o.product_id::text)::uuid, o.branch_id, o.price_minor, o.status, auth.uid()
  from public.product_branch_overrides o where o.menu_id = p_menu_id and v_prod_map ? o.product_id::text;

  insert into public.variant_branch_prices (business_id, menu_id, variant_id, branch_id, price_minor, updated_by)
  select vp.business_id, v_new_id, (v_var_map ->> vp.variant_id::text)::uuid, vp.branch_id, vp.price_minor, auth.uid()
  from public.variant_branch_prices vp where vp.menu_id = p_menu_id and v_var_map ? vp.variant_id::text;

  perform app.audit(v_menu.business_id, 'menu.duplicated', 'menu', v_new_id,
    'Duplicó la carta ' || v_menu.name || ' como ' || btrim(p_name), jsonb_build_object('source_menu_id', p_menu_id));
  return v_new_id;
exception
  when unique_violation then
    perform app.fail(409, 'duplicate');
end;
$$;

-- Asigna las sucursales donde se muestra un menú. Quitar una sucursal saca la
-- carta de su menú público en el acto.
create or replace function public.set_menu_branches(p_menu_id uuid, p_branch_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_ids uuid[] := coalesce((select array_agg(distinct x) from unnest(p_branch_ids) x where x is not null), '{}');
  v_before jsonb;
begin
  select * into v_menu from public.menus where id = p_menu_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  perform app.require_permission(v_menu.business_id, 'menus.manage');
  perform app.require_active_business(v_menu.business_id);
  if (select count(*) from public.branches where business_id = v_menu.business_id and id = any (v_ids)) <> cardinality(v_ids) then
    perform app.fail(422, 'invalid_branch');
  end if;

  v_before := app.menu_branch_slugs(p_menu_id);
  delete from public.menu_branches where menu_id = p_menu_id and not (branch_id = any (v_ids));
  insert into public.menu_branches (business_id, menu_id, branch_id, sort_order)
  select v_menu.business_id, p_menu_id, b, coalesce((select max(sort_order) + 1 from public.menu_branches where branch_id = b), 0)
  from unnest(v_ids) b
  on conflict (menu_id, branch_id) do nothing;

  perform app.audit(v_menu.business_id, 'menu.branches_updated', 'menu', p_menu_id,
    'Cambió las sucursales de la carta ' || v_menu.name, jsonb_build_object('branch_ids', to_jsonb(v_ids)));
  return jsonb_build_object(
    'branch_slugs',
    (select coalesce(jsonb_agg(distinct s), '[]'::jsonb) from (
      select jsonb_array_elements_text(v_before) s
      union select jsonb_array_elements_text(app.menu_branch_slugs(p_menu_id))
    ) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
create or replace function public.create_category(p_menu_id uuid, p_name text, p_description text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus := app.require_menu_edit(p_menu_id);
  v_id uuid;
begin
  if (select count(*) from public.categories where menu_id = p_menu_id) >= 60 then
    perform app.fail(422, 'too_many_categories');
  end if;
  insert into public.categories (business_id, menu_id, name, description, sort_order)
  values (
    v_menu.business_id, p_menu_id, btrim(p_name), btrim(coalesce(p_description, '')),
    coalesce((select max(sort_order) + 1 from public.categories where menu_id = p_menu_id), 0)
  )
  returning id into v_id;
  perform app.audit(v_menu.business_id, 'category.created', 'category', v_id, 'Creó la categoría ' || btrim(p_name), '{}'::jsonb);
  return v_id;
exception
  when unique_violation then
    perform app.fail(409, 'category_name_taken');
end;
$$;

create or replace function public.update_category(
  p_category_id uuid,
  p_name text,
  p_description text,
  p_expected_revision int
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_menu public.menus;
begin
  select * into v_category from public.categories where id = p_category_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_category.menu_id);
  if p_expected_revision is not null and v_category.revision <> p_expected_revision then
    perform app.fail(409, 'revision_conflict', v_category.revision::text);
  end if;
  update public.categories
  set name = btrim(p_name), description = btrim(coalesce(p_description, '')), revision = revision + 1
  where id = p_category_id;
  perform app.audit(v_menu.business_id, 'category.updated', 'category', p_category_id, 'Editó la categoría ' || btrim(p_name), '{}'::jsonb);
  return v_category.revision + 1;
exception
  when unique_violation then
    perform app.fail(409, 'category_name_taken');
end;
$$;

create or replace function public.reorder_categories(p_menu_id uuid, p_category_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus := app.require_menu_edit(p_menu_id);
begin
  if p_category_ids is null
     or cardinality(p_category_ids) <> (select count(*) from public.categories where menu_id = p_menu_id)
     or exists (select 1 from unnest(p_category_ids) x where not exists (select 1 from public.categories c where c.id = x and c.menu_id = p_menu_id))
     or cardinality(p_category_ids) <> (select count(distinct x) from unnest(p_category_ids) x) then
    perform app.fail(409, 'stale_order');
  end if;
  update public.categories c
  set sort_order = o.ord - 1
  from unnest(p_category_ids) with ordinality as o(id, ord)
  where c.id = o.id and c.menu_id = p_menu_id;
  perform app.audit(v_menu.business_id, 'category.reordered', 'menu', p_menu_id, 'Reordenó las categorías', '{}'::jsonb);
end;
$$;

-- Borra una categoría. Si tiene productos, hay que indicar a qué categoría
-- moverlos; si no, falla con category_not_empty (la interfaz pregunta).
create or replace function public.delete_category(p_category_id uuid, p_move_to_category_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_menu public.menus;
  v_count int;
  v_conflict text;
begin
  select * into v_category from public.categories where id = p_category_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_category.menu_id);
  select count(*) into v_count from public.products where category_id = p_category_id;

  if v_count > 0 then
    if p_move_to_category_id is null then
      perform app.fail(409, 'category_not_empty', v_count::text);
    end if;
    if p_move_to_category_id = p_category_id
       or not exists (select 1 from public.categories where id = p_move_to_category_id and menu_id = v_category.menu_id) then
      perform app.fail(422, 'invalid_category');
    end if;
    select p.name into v_conflict
    from public.products p
    join public.products q on q.category_id = p_move_to_category_id and q.name_key = p.name_key and q.archived_at is null
    where p.category_id = p_category_id and p.archived_at is null
    limit 1;
    if v_conflict is not null then
      perform app.fail(409, 'product_name_taken', v_conflict);
    end if;
    update public.products
    set category_id = p_move_to_category_id,
        sort_order = sort_order + coalesce((select max(sort_order) + 1 from public.products where category_id = p_move_to_category_id), 0),
        revision = revision + 1,
        updated_by = auth.uid()
    where category_id = p_category_id;
  end if;

  delete from public.categories where id = p_category_id;
  perform app.audit(v_menu.business_id, 'category.deleted', 'category', p_category_id,
    'Eliminó la categoría ' || v_category.name,
    jsonb_build_object('moved_products', v_count, 'moved_to', p_move_to_category_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------
create or replace function app.validate_tags(p_tags jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tags text[];
begin
  if p_tags is null or jsonb_typeof(p_tags) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(p_tags) <> 'array' then
    perform app.fail(422, 'invalid_tags');
  end if;
  select coalesce(array_agg(distinct t order by t), '{}') into v_tags from jsonb_array_elements_text(p_tags) t;
  if not v_tags <@ array['vegetariano', 'vegano', 'sin_tacc', 'sin_lactosa', 'picante', 'nuevo', 'recomendado', 'para_compartir']::text[] then
    perform app.fail(422, 'invalid_tags');
  end if;
  return v_tags;
end;
$$;

-- Guarda un producto con sus variantes y extras en una sola transacción.
-- p_payload: {id?, menu_id, category_id, expected_revision?, name, description,
--   price_minor, status, tags[], image_media_id, variants:[{id?, name, price_minor}],
--   extras:[{id?, name, price_minor}]}
create or replace function public.save_product(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_product public.products;
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_menu_id uuid := (p_payload ->> 'menu_id')::uuid;
  v_category_id uuid := (p_payload ->> 'category_id')::uuid;
  v_name text := btrim(coalesce(p_payload ->> 'name', ''));
  v_description text := btrim(coalesce(p_payload ->> 'description', ''));
  v_price bigint := app.jsonb_bigint(p_payload -> 'price_minor');
  v_status text := coalesce(p_payload ->> 'status', 'available');
  v_tags text[] := app.validate_tags(p_payload -> 'tags');
  v_image uuid := nullif(p_payload ->> 'image_media_id', '')::uuid;
  v_variants jsonb := coalesce(p_payload -> 'variants', '[]'::jsonb);
  v_extras jsonb := coalesce(p_payload -> 'extras', '[]'::jsonb);
  v_item jsonb;
  v_ord int;
  v_constraint text;
  v_revision int;
  v_created boolean := v_id is null;
begin
  v_menu := app.require_menu_edit(v_menu_id);

  if char_length(v_name) not between 1 and 120 then
    perform app.fail(422, 'invalid_name');
  end if;
  if char_length(v_description) > 600 then
    perform app.fail(422, 'description_too_long');
  end if;
  perform app.check_price(v_price, 'price_minor');
  if v_status not in ('available', 'sold_out', 'hidden') then
    perform app.fail(422, 'invalid_status');
  end if;
  if not exists (select 1 from public.categories where id = v_category_id and menu_id = v_menu_id) then
    perform app.fail(422, 'invalid_category');
  end if;
  if v_image is not null and not exists (
    select 1 from public.media where id = v_image and business_id = v_menu.business_id and kind = 'product_image'
  ) then
    perform app.fail(422, 'invalid_media');
  end if;
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) > 20 then
    perform app.fail(422, 'invalid_variants');
  end if;
  if jsonb_typeof(v_extras) <> 'array' or jsonb_array_length(v_extras) > 30 then
    perform app.fail(422, 'invalid_extras');
  end if;
  for v_item in select * from jsonb_array_elements(v_variants) loop
    if char_length(btrim(coalesce(v_item ->> 'name', ''))) not between 1 and 60 then
      perform app.fail(422, 'invalid_variant_name');
    end if;
    perform app.check_price(app.jsonb_bigint(v_item -> 'price_minor'), 'variant');
  end loop;
  for v_item in select * from jsonb_array_elements(v_extras) loop
    if char_length(btrim(coalesce(v_item ->> 'name', ''))) not between 1 and 60 then
      perform app.fail(422, 'invalid_extra_name');
    end if;
    if app.jsonb_bigint(v_item -> 'price_minor') is null then
      perform app.fail(422, 'invalid_price', 'extra');
    end if;
    perform app.check_price(app.jsonb_bigint(v_item -> 'price_minor'), 'extra');
  end loop;

  if v_created then
    if (select count(*) from public.products where menu_id = v_menu_id and archived_at is null) >= 1000 then
      perform app.fail(422, 'too_many_products');
    end if;
    insert into public.products (
      business_id, menu_id, category_id, name, description, price_minor, status, tags, image_media_id,
      sort_order, created_by, updated_by
    )
    values (
      v_menu.business_id, v_menu_id, v_category_id, v_name, v_description, v_price, v_status, v_tags, v_image,
      coalesce((select max(sort_order) + 1 from public.products where category_id = v_category_id), 0),
      auth.uid(), auth.uid()
    )
    returning * into v_product;
  else
    select * into v_product from public.products where id = v_id and menu_id = v_menu_id for update;
    if not found then
      perform app.fail(404, 'not_found');
    end if;
    if v_product.archived_at is not null then
      perform app.fail(409, 'product_archived');
    end if;
    if (p_payload ? 'expected_revision') and v_product.revision <> (p_payload ->> 'expected_revision')::int then
      perform app.fail(409, 'revision_conflict', v_product.revision::text);
    end if;
    update public.products
    set category_id = v_category_id,
        name = v_name,
        description = v_description,
        price_minor = v_price,
        status = v_status,
        tags = v_tags,
        image_media_id = v_image,
        sort_order = case when category_id = v_category_id then sort_order
                          else coalesce((select max(sort_order) + 1 from public.products where category_id = v_category_id), 0) end,
        revision = revision + 1,
        updated_by = auth.uid()
    where id = v_id
    returning * into v_product;
  end if;

  -- Variantes: se reemplazan respetando los id existentes del mismo producto.
  delete from public.product_variants
  where product_id = v_product.id
    and id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(v_variants) x where nullif(x ->> 'id', '') is not null
    );
  v_ord := 0;
  for v_item in select * from jsonb_array_elements(v_variants) loop
    if nullif(v_item ->> 'id', '') is not null
       and exists (select 1 from public.product_variants where id = (v_item ->> 'id')::uuid and product_id = v_product.id) then
      update public.product_variants
      set name = btrim(v_item ->> 'name'), price_minor = app.jsonb_bigint(v_item -> 'price_minor'), sort_order = v_ord
      where id = (v_item ->> 'id')::uuid;
    else
      insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order)
      values (v_menu.business_id, v_menu_id, v_product.id, btrim(v_item ->> 'name'), app.jsonb_bigint(v_item -> 'price_minor'), v_ord);
    end if;
    v_ord := v_ord + 1;
  end loop;

  delete from public.product_extras
  where product_id = v_product.id
    and id not in (
      select (x ->> 'id')::uuid from jsonb_array_elements(v_extras) x where nullif(x ->> 'id', '') is not null
    );
  v_ord := 0;
  for v_item in select * from jsonb_array_elements(v_extras) loop
    if nullif(v_item ->> 'id', '') is not null
       and exists (select 1 from public.product_extras where id = (v_item ->> 'id')::uuid and product_id = v_product.id) then
      update public.product_extras
      set name = btrim(v_item ->> 'name'), price_minor = app.jsonb_bigint(v_item -> 'price_minor'), sort_order = v_ord
      where id = (v_item ->> 'id')::uuid;
    else
      insert into public.product_extras (business_id, menu_id, product_id, name, price_minor, sort_order)
      values (v_menu.business_id, v_menu_id, v_product.id, btrim(v_item ->> 'name'), app.jsonb_bigint(v_item -> 'price_minor'), v_ord);
    end if;
    v_ord := v_ord + 1;
  end loop;

  perform app.audit(v_menu.business_id,
    case when v_created then 'product.created' else 'product.updated' end,
    'product', v_product.id,
    case when v_created then 'Creó el producto ' else 'Editó el producto ' end || v_name, '{}'::jsonb);

  return jsonb_build_object('id', v_product.id, 'revision', v_product.revision);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    perform app.fail(409, app.unique_violation_code(v_constraint));
end;
$$;

create or replace function public.set_product_status(p_product_id uuid, p_status text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_menu public.menus;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_product.menu_id);
  if p_status not in ('available', 'sold_out', 'hidden') then
    perform app.fail(422, 'invalid_status');
  end if;
  if v_product.archived_at is not null then
    perform app.fail(409, 'product_archived');
  end if;
  if v_product.status = p_status then
    return v_product.revision;
  end if;
  update public.products set status = p_status, revision = revision + 1, updated_by = auth.uid() where id = p_product_id;
  perform app.audit(v_menu.business_id, 'product.status_changed', 'product', p_product_id,
    'Cambió la disponibilidad de ' || v_product.name, jsonb_build_object('from', v_product.status, 'to', p_status));
  return v_product.revision + 1;
end;
$$;

create or replace function public.duplicate_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_menu public.menus;
  v_name text;
  v_new uuid;
  i int := 1;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_product.menu_id);
  if v_product.archived_at is not null then
    perform app.fail(409, 'product_archived');
  end if;
  loop
    v_name := left(v_product.name, 105) || case when i = 1 then ' (copia)' else ' (copia ' || i || ')' end;
    exit when not exists (
      select 1 from public.products
      where category_id = v_product.category_id and name_key = app.name_key(v_name) and archived_at is null
    );
    i := i + 1;
    if i > 50 then
      perform app.fail(409, 'product_name_taken');
    end if;
  end loop;

  update public.products set sort_order = sort_order + 1
  where category_id = v_product.category_id and sort_order > v_product.sort_order;

  insert into public.products (
    business_id, menu_id, category_id, name, description, price_minor, status, tags, image_media_id,
    sort_order, created_by, updated_by
  )
  values (
    v_product.business_id, v_product.menu_id, v_product.category_id, v_name, v_product.description,
    v_product.price_minor, v_product.status, v_product.tags, v_product.image_media_id,
    v_product.sort_order + 1, auth.uid(), auth.uid()
  )
  returning id into v_new;

  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order)
  select business_id, menu_id, v_new, name, price_minor, sort_order from public.product_variants where product_id = p_product_id;
  insert into public.product_extras (business_id, menu_id, product_id, name, price_minor, sort_order)
  select business_id, menu_id, v_new, name, price_minor, sort_order from public.product_extras where product_id = p_product_id;

  perform app.audit(v_menu.business_id, 'product.duplicated', 'product', v_new,
    'Duplicó el producto ' || v_product.name, jsonb_build_object('source_product_id', p_product_id));
  return v_new;
end;
$$;

create or replace function public.archive_product(p_product_id uuid, p_expected_revision int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_menu public.menus;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_product.menu_id);
  if v_product.archived_at is not null then
    return;
  end if;
  if p_expected_revision is not null and v_product.revision <> p_expected_revision then
    perform app.fail(409, 'revision_conflict', v_product.revision::text);
  end if;
  update public.products
  set archived_at = now(), archived_by = auth.uid(), revision = revision + 1, updated_by = auth.uid()
  where id = p_product_id;
  perform app.audit(v_menu.business_id, 'product.archived', 'product', p_product_id, 'Archivó el producto ' || v_product.name, '{}'::jsonb);
end;
$$;

create or replace function public.unarchive_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_menu public.menus;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_product.menu_id);
  if v_product.archived_at is null then
    return;
  end if;
  update public.products
  set archived_at = null, archived_by = null, revision = revision + 1, updated_by = auth.uid(),
      sort_order = coalesce((select max(sort_order) + 1 from public.products where category_id = v_product.category_id and archived_at is null), 0)
  where id = p_product_id;
  perform app.audit(v_menu.business_id, 'product.unarchived', 'product', p_product_id, 'Restauró el producto ' || v_product.name, '{}'::jsonb);
exception
  when unique_violation then
    perform app.fail(409, 'product_name_taken', v_product.name);
end;
$$;

create or replace function public.reorder_products(p_category_id uuid, p_product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.categories;
  v_menu public.menus;
begin
  select * into v_category from public.categories where id = p_category_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  v_menu := app.require_menu_edit(v_category.menu_id);
  if p_product_ids is null
     or cardinality(p_product_ids) <> (select count(*) from public.products where category_id = p_category_id and archived_at is null)
     or exists (
       select 1 from unnest(p_product_ids) x
       where not exists (select 1 from public.products p where p.id = x and p.category_id = p_category_id and p.archived_at is null)
     )
     or cardinality(p_product_ids) <> (select count(distinct x) from unnest(p_product_ids) x) then
    perform app.fail(409, 'stale_order');
  end if;
  update public.products p
  set sort_order = o.ord - 1
  from unnest(p_product_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.category_id = p_category_id;
end;
$$;

-- Precio y disponibilidad propios de una sucursal (catálogo compartido).
-- Alcanza con tener acceso a esa sucursal.
create or replace function public.set_branch_override(
  p_product_id uuid,
  p_branch_id uuid,
  p_price_minor bigint,
  p_status text,
  p_variant_prices jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_menu public.menus;
  v_membership public.memberships;
  v_item jsonb;
begin
  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  select * into v_menu from public.menus where id = v_product.menu_id;
  v_membership := app.require_permission(v_menu.business_id, 'catalog.edit');
  perform app.require_active_business(v_menu.business_id);
  if v_menu.status <> 'active' then
    perform app.fail(409, 'menu_archived');
  end if;
  if not app.membership_covers_branch(v_membership, p_branch_id) then
    perform app.fail(403, 'branch_scope');
  end if;
  if not exists (select 1 from public.menu_branches where menu_id = v_menu.id and branch_id = p_branch_id) then
    perform app.fail(422, 'branch_not_in_menu');
  end if;
  perform app.check_price(p_price_minor, 'price_minor');
  if p_status is not null and p_status not in ('available', 'sold_out', 'hidden') then
    perform app.fail(422, 'invalid_status');
  end if;

  if p_price_minor is null and p_status is null then
    delete from public.product_branch_overrides where product_id = p_product_id and branch_id = p_branch_id;
  else
    insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, price_minor, status, updated_by)
    values (v_menu.business_id, v_menu.id, p_product_id, p_branch_id, p_price_minor, p_status, auth.uid())
    on conflict (product_id, branch_id) do update
      set price_minor = excluded.price_minor, status = excluded.status, updated_by = excluded.updated_by, updated_at = now();
  end if;

  if jsonb_typeof(coalesce(p_variant_prices, '[]'::jsonb)) <> 'array' then
    perform app.fail(422, 'invalid_variants');
  end if;
  delete from public.variant_branch_prices vp
  using public.product_variants v
  where vp.variant_id = v.id and v.product_id = p_product_id and vp.branch_id = p_branch_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_variant_prices, '[]'::jsonb)) loop
    if not exists (select 1 from public.product_variants where id = (v_item ->> 'variant_id')::uuid and product_id = p_product_id) then
      perform app.fail(422, 'invalid_variant');
    end if;
    if app.jsonb_bigint(v_item -> 'price_minor') is not null then
      perform app.check_price(app.jsonb_bigint(v_item -> 'price_minor'), 'variant');
      insert into public.variant_branch_prices (business_id, menu_id, variant_id, branch_id, price_minor, updated_by)
      values (v_menu.business_id, v_menu.id, (v_item ->> 'variant_id')::uuid, p_branch_id, app.jsonb_bigint(v_item -> 'price_minor'), auth.uid());
    end if;
  end loop;

  perform app.audit(v_menu.business_id, 'product.branch_override', 'product', p_product_id,
    'Cambió precio o disponibilidad de ' || v_product.name || ' en una sucursal',
    jsonb_build_object('price_minor', p_price_minor, 'status', p_status), p_branch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Instantáneas
-- ---------------------------------------------------------------------------
-- Construye la carta tal como la vería el público en una sucursal: aplica
-- precios y disponibilidad de la sucursal, excluye ocultos y archivados.
-- Determinística: el mismo contenido produce el mismo JSON (y el mismo hash).
create or replace function app.build_menu_snapshot(p_menu_id uuid, p_branch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select * from public.menus where id = p_menu_id
  ),
  prods as (
    select p.id, p.category_id, p.name, p.description, p.tags, p.image_media_id, p.sort_order,
           coalesce(o.status, p.status) as eff_status,
           coalesce(o.price_minor, p.price_minor) as eff_price
    from public.products p
    left join public.product_branch_overrides o on o.product_id = p.id and o.branch_id = p_branch_id
    where p.menu_id = p_menu_id and p.archived_at is null
  ),
  visible as (
    select * from prods where eff_status <> 'hidden'
  ),
  cats as (
    select c.id, c.name, c.description, c.sort_order,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'name', v.name,
            'description', v.description,
            'price_minor', v.eff_price,
            'status', v.eff_status,
            'tags', to_jsonb(v.tags),
            'image', case when md.id is null then null else jsonb_build_object(
              'sm', md.path_sm, 'lg', md.path_lg, 'w', md.width, 'h', md.height) end,
            'variants', coalesce((
              select jsonb_agg(
                jsonb_build_object('id', pv.id, 'name', pv.name, 'price_minor', coalesce(vp.price_minor, pv.price_minor))
                order by pv.sort_order, pv.name, pv.id)
              from public.product_variants pv
              left join public.variant_branch_prices vp on vp.variant_id = pv.id and vp.branch_id = p_branch_id
              where pv.product_id = v.id
            ), '[]'::jsonb),
            'extras', coalesce((
              select jsonb_agg(
                jsonb_build_object('id', pe.id, 'name', pe.name, 'price_minor', pe.price_minor)
                order by pe.sort_order, pe.name, pe.id)
              from public.product_extras pe
              where pe.product_id = v.id
            ), '[]'::jsonb)
          )
          order by v.sort_order, v.name, v.id
        )
        from visible v
        left join public.media md on md.id = v.image_media_id
        where v.category_id = c.id
      ) as products
    from public.categories c
    where c.menu_id = p_menu_id
  )
  select jsonb_build_object(
    'v', 1,
    'menu', (select jsonb_build_object('id', id, 'name', name, 'description', description, 'kind', kind) from m),
    'currency', (select b.currency from public.businesses b where b.id = (select business_id from m)),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', id, 'name', name, 'description', description, 'products', products)
        order by sort_order, name, id)
      from cats
      where products is not null
    ), '[]'::jsonb)
  );
$$;

create or replace function app.snapshot_products(p_snapshot jsonb)
returns table (id uuid, name text, price_minor bigint, status text, data jsonb)
language sql
immutable
set search_path = ''
as $$
  select (p ->> 'id')::uuid, p ->> 'name', (p ->> 'price_minor')::bigint, p ->> 'status', p
  from jsonb_array_elements(coalesce(p_snapshot -> 'categories', '[]'::jsonb)) c,
       jsonb_array_elements(coalesce(c -> 'products', '[]'::jsonb)) p;
$$;

create or replace function app.snapshot_variant_prices(p_product jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(v ->> 'id', v -> 'price_minor'), '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_product -> 'variants', '[]'::jsonb)) v;
$$;

create or replace function app.snapshot_change_summary(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with o as (select * from app.snapshot_products(p_old)),
       n as (select * from app.snapshot_products(p_new))
  select jsonb_build_object(
    'products', (select count(*) from n),
    'added', (select count(*) from n where not exists (select 1 from o where o.id = n.id)),
    'removed', (select count(*) from o where not exists (select 1 from n where n.id = o.id)),
    'price_changed', (
      select count(*) from n join o on o.id = n.id
      where n.price_minor is distinct from o.price_minor
         or app.snapshot_variant_prices(n.data) is distinct from app.snapshot_variant_prices(o.data)
    ),
    'availability_changed', (select count(*) from n join o on o.id = n.id where n.status is distinct from o.status),
    'details_changed', (
      select count(*) from n join o on o.id = n.id
      where (n.data - 'price_minor' - 'status' - 'variants') is distinct from (o.data - 'price_minor' - 'status' - 'variants')
         or (select jsonb_agg(v - 'price_minor') from jsonb_array_elements(n.data -> 'variants') v)
            is distinct from (select jsonb_agg(v - 'price_minor') from jsonb_array_elements(o.data -> 'variants') v)
    ),
    'first', p_old is null
  );
$$;

-- Estado de publicación por sucursal: si el borrador difiere de lo publicado.
create or replace function public.get_menu_publish_status(p_menu_id uuid)
returns table (
  branch_id uuid,
  branch_name text,
  public_slug text,
  published_version_id uuid,
  version_number int,
  published_at timestamptz,
  published_product_count int,
  draft_product_count int,
  has_changes boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_menu public.menus := app.require_menu_view(p_menu_id);
begin
  return query
  with s as (
    select mb.branch_id, b.name, b.public_slug, mb.published_version_id, mb.sort_order,
           app.build_menu_snapshot(p_menu_id, mb.branch_id) as snap
    from public.menu_branches mb
    join public.branches b on b.id = mb.branch_id
    where mb.menu_id = p_menu_id and app.can_access_branch(v_menu.business_id, mb.branch_id)
  )
  select s.branch_id, s.name, s.public_slug, s.published_version_id, v.version_number, v.created_at, v.product_count,
         (select count(*)::int from app.snapshot_products(s.snap)),
         v.id is null or v.content_hash <> app.sha256_hex(s.snap::text)
  from s
  left join public.menu_versions v on v.id = s.published_version_id
  order by s.sort_order, s.name;
end;
$$;

-- Instantánea del borrador para la vista previa (no es lo que ve el público).
create or replace function public.get_draft_snapshot(p_menu_id uuid, p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_menu public.menus := app.require_menu_view(p_menu_id);
begin
  if not app.can_access_branch(v_menu.business_id, p_branch_id)
     or not exists (select 1 from public.menu_branches where menu_id = p_menu_id and branch_id = p_branch_id) then
    perform app.fail(404, 'not_found');
  end if;
  return app.build_menu_snapshot(p_menu_id, p_branch_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Publicación (atómica e idempotente)
-- ---------------------------------------------------------------------------
create or replace function app.publication_result(p_publication_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publication_id', p.id,
    'changed', true,
    'replayed', p_replayed,
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branch_id', v.branch_id, 'changed', true, 'version_number', v.version_number, 'version_id', v.id)
        order by v.branch_id)
      from public.menu_versions v where v.publication_id = p.id
    ), '[]'::jsonb),
    'branch_slugs', coalesce((
      select jsonb_agg(b.public_slug order by b.public_slug)
      from public.menu_versions v join public.branches b on b.id = v.branch_id
      where v.publication_id = p.id
    ), '[]'::jsonb)
  )
  from public.publications p
  where p.id = p_publication_id;
$$;

-- Inserta una versión para (menú, sucursal) y mueve el puntero. Uso interno.
create or replace function app.write_version(
  p_menu public.menus,
  p_branch_id uuid,
  p_publication_id uuid,
  p_snapshot jsonb,
  p_hash text
)
returns public.menu_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.menu_versions;
  v_number int;
  v_version public.menu_versions;
begin
  select v.* into v_current
  from public.menu_branches mb
  join public.menu_versions v on v.id = mb.published_version_id
  where mb.menu_id = p_menu.id and mb.branch_id = p_branch_id;

  select coalesce(max(version_number), 0) + 1 into v_number
  from public.menu_versions where menu_id = p_menu.id and branch_id = p_branch_id;

  insert into public.menu_versions (
    business_id, menu_id, branch_id, publication_id, version_number, snapshot, content_hash, product_count, change_summary
  )
  values (
    p_menu.business_id, p_menu.id, p_branch_id, p_publication_id, v_number, p_snapshot, p_hash,
    (select count(*) from app.snapshot_products(p_snapshot)),
    app.snapshot_change_summary(v_current.snapshot, p_snapshot)
  )
  returning * into v_version;

  update public.menu_branches
  set published_version_id = v_version.id, published_at = now()
  where menu_id = p_menu.id and branch_id = p_branch_id;

  return v_version;
end;
$$;

create or replace function public.publish_menu(
  p_menu_id uuid,
  p_branch_ids uuid[],
  p_idempotency_key uuid,
  p_note text default '',
  p_source text default 'manual',
  p_import_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menu public.menus;
  v_membership public.memberships;
  v_existing uuid;
  v_branch uuid;
  v_branches uuid[];
  v_snapshot jsonb;
  v_hash text;
  v_current_hash text;
  v_current_number int;
  v_publication_id uuid;
  v_version public.menu_versions;
  v_results jsonb := '[]'::jsonb;
  v_changed int := 0;
begin
  perform app.require_user();
  if p_idempotency_key is null then
    perform app.fail(422, 'idempotency_key_required');
  end if;
  if p_source not in ('manual', 'import', 'bulk_price') then
    perform app.fail(422, 'invalid_source');
  end if;

  -- Bloquea el menú: publicaciones concurrentes del mismo menú se serializan.
  select * into v_menu from public.menus where id = p_menu_id for update;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  if not app.can_view_menu(v_menu.business_id, v_menu.id) then
    perform app.fail(404, 'not_found');
  end if;
  v_membership := app.require_permission(v_menu.business_id, 'catalog.publish');
  perform app.require_active_business(v_menu.business_id);

  select id into v_existing from public.publications
  where business_id = v_menu.business_id and idempotency_key = p_idempotency_key;
  if found then
    return app.publication_result(v_existing, true);
  end if;

  if v_menu.status <> 'active' then
    perform app.fail(409, 'menu_archived');
  end if;

  v_branches := coalesce((select array_agg(distinct x order by x) from unnest(p_branch_ids) x where x is not null), '{}');
  if cardinality(v_branches) = 0 then
    perform app.fail(422, 'branches_required');
  end if;
  foreach v_branch in array v_branches loop
    if not exists (select 1 from public.menu_branches where menu_id = p_menu_id and branch_id = v_branch) then
      perform app.fail(422, 'branch_not_in_menu');
    end if;
    if not app.membership_covers_branch(v_membership, v_branch) then
      perform app.fail(403, 'branch_scope');
    end if;
  end loop;

  if p_import_id is not null and not exists (
    select 1 from public.imports where id = p_import_id and menu_id = p_menu_id
  ) then
    perform app.fail(422, 'invalid_import');
  end if;

  foreach v_branch in array v_branches loop
    v_snapshot := app.build_menu_snapshot(p_menu_id, v_branch);
    v_hash := app.sha256_hex(v_snapshot::text);

    select v.content_hash, v.version_number into v_current_hash, v_current_number
    from public.menu_branches mb
    left join public.menu_versions v on v.id = mb.published_version_id
    where mb.menu_id = p_menu_id and mb.branch_id = v_branch
    for update of mb;

    if v_current_hash is not null and v_current_hash = v_hash then
      v_results := v_results || jsonb_build_object('branch_id', v_branch, 'changed', false, 'version_number', v_current_number);
      continue;
    end if;

    if v_publication_id is null then
      insert into public.publications (business_id, menu_id, source, import_id, idempotency_key, published_by, note)
      values (v_menu.business_id, p_menu_id, p_source, p_import_id, p_idempotency_key, auth.uid(),
              left(btrim(coalesce(p_note, '')), 300))
      returning id into v_publication_id;
    end if;

    v_version := app.write_version(v_menu, v_branch, v_publication_id, v_snapshot, v_hash);
    v_changed := v_changed + 1;
    v_results := v_results || jsonb_build_object(
      'branch_id', v_branch, 'changed', true, 'version_number', v_version.version_number, 'version_id', v_version.id);
  end loop;

  if v_publication_id is not null then
    perform app.audit(v_menu.business_id, 'menu.published', 'publication', v_publication_id,
      'Publicó la carta ' || v_menu.name,
      jsonb_build_object('menu_id', p_menu_id, 'branches', v_results, 'source', p_source, 'import_id', p_import_id),
      case when cardinality(v_branches) = 1 then v_branches[1] else null end);
  end if;

  return jsonb_build_object(
    'publication_id', v_publication_id,
    'changed', v_changed > 0,
    'replayed', false,
    'branches', v_results,
    'branch_slugs', (select coalesce(jsonb_agg(public_slug order by public_slug), '[]'::jsonb) from public.branches where id = any (v_branches))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Restauración: crea una NUEVA publicación con el contenido de una versión
-- anterior. El historial no se borra. Opcionalmente restaura el borrador
-- (solo en cartas de una única sucursal, para no afectar a otras).
-- ---------------------------------------------------------------------------
create or replace function app.restore_draft_from_snapshot(p_menu public.menus, p_branch_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_ext jsonb;
  v_cat_ord int := 0;
  v_prod_ord int;
  v_cat_id uuid;
  v_media uuid;
  v_name text;
  v_kept uuid[] := '{}';
  v_ord int;
begin
  for v_cat in select * from jsonb_array_elements(p_snapshot -> 'categories') loop
    select id into v_cat_id from public.categories where id = (v_cat ->> 'id')::uuid and menu_id = p_menu.id;
    if not found then
      select id into v_cat_id from public.categories where menu_id = p_menu.id and name_key = app.name_key(v_cat ->> 'name');
    end if;
    if v_cat_id is null then
      insert into public.categories (id, business_id, menu_id, name, description, sort_order)
      values ((v_cat ->> 'id')::uuid, p_menu.business_id, p_menu.id, v_cat ->> 'name', coalesce(v_cat ->> 'description', ''), v_cat_ord)
      returning id into v_cat_id;
    else
      update public.categories
      set name = v_cat ->> 'name', description = coalesce(v_cat ->> 'description', ''), sort_order = v_cat_ord, revision = revision + 1
      where id = v_cat_id;
    end if;

    v_prod_ord := 0;
    for v_prod in select * from jsonb_array_elements(v_cat -> 'products') loop
      v_media := null;
      if v_prod -> 'image' is not null and jsonb_typeof(v_prod -> 'image') = 'object' then
        select id into v_media from public.media
        where business_id = p_menu.business_id and path_lg = v_prod -> 'image' ->> 'lg';
      end if;

      v_name := v_prod ->> 'name';
      if exists (
        select 1 from public.products
        where category_id = v_cat_id and name_key = app.name_key(v_name) and archived_at is null and id <> (v_prod ->> 'id')::uuid
      ) then
        v_name := left(v_name, 105) || ' (restaurado)';
      end if;

      if exists (select 1 from public.products where id = (v_prod ->> 'id')::uuid and menu_id = p_menu.id) then
        update public.products
        set category_id = v_cat_id,
            name = v_name,
            description = coalesce(v_prod ->> 'description', ''),
            price_minor = (v_prod ->> 'price_minor')::bigint,
            status = v_prod ->> 'status',
            tags = coalesce((select array_agg(t) from jsonb_array_elements_text(v_prod -> 'tags') t), '{}'),
            image_media_id = v_media,
            sort_order = v_prod_ord,
            archived_at = null,
            archived_by = null,
            revision = revision + 1,
            updated_by = auth.uid()
        where id = (v_prod ->> 'id')::uuid;
      else
        insert into public.products (
          id, business_id, menu_id, category_id, name, description, price_minor, status, tags, image_media_id,
          sort_order, created_by, updated_by
        )
        values (
          (v_prod ->> 'id')::uuid, p_menu.business_id, p_menu.id, v_cat_id, v_name, coalesce(v_prod ->> 'description', ''),
          (v_prod ->> 'price_minor')::bigint, v_prod ->> 'status',
          coalesce((select array_agg(t) from jsonb_array_elements_text(v_prod -> 'tags') t), '{}'),
          v_media, v_prod_ord, auth.uid(), auth.uid()
        );
      end if;

      delete from public.product_branch_overrides where product_id = (v_prod ->> 'id')::uuid and branch_id = p_branch_id;
      delete from public.product_variants where product_id = (v_prod ->> 'id')::uuid;
      v_ord := 0;
      for v_var in select * from jsonb_array_elements(coalesce(v_prod -> 'variants', '[]'::jsonb)) loop
        insert into public.product_variants (id, business_id, menu_id, product_id, name, price_minor, sort_order)
        values ((v_var ->> 'id')::uuid, p_menu.business_id, p_menu.id, (v_prod ->> 'id')::uuid, v_var ->> 'name',
                (v_var ->> 'price_minor')::bigint, v_ord);
        v_ord := v_ord + 1;
      end loop;
      delete from public.product_extras where product_id = (v_prod ->> 'id')::uuid;
      v_ord := 0;
      for v_ext in select * from jsonb_array_elements(coalesce(v_prod -> 'extras', '[]'::jsonb)) loop
        insert into public.product_extras (id, business_id, menu_id, product_id, name, price_minor, sort_order)
        values ((v_ext ->> 'id')::uuid, p_menu.business_id, p_menu.id, (v_prod ->> 'id')::uuid, v_ext ->> 'name',
                (v_ext ->> 'price_minor')::bigint, v_ord);
        v_ord := v_ord + 1;
      end loop;

      v_kept := array_append(v_kept, (v_prod ->> 'id')::uuid);
      v_prod_ord := v_prod_ord + 1;
    end loop;
    v_cat_ord := v_cat_ord + 1;
  end loop;

  -- Lo que no estaba en esa versión queda oculto (no se borra).
  update public.products
  set status = 'hidden', revision = revision + 1, updated_by = auth.uid()
  where menu_id = p_menu.id and archived_at is null and status <> 'hidden' and not (id = any (v_kept));
end;
$$;

create or replace function public.restore_menu_version(
  p_version_id uuid,
  p_idempotency_key uuid,
  p_restore_draft boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.menu_versions;
  v_menu public.menus;
  v_membership public.memberships;
  v_existing uuid;
  v_current_id uuid;
  v_publication_id uuid;
  v_new public.menu_versions;
begin
  perform app.require_user();
  if p_idempotency_key is null then
    perform app.fail(422, 'idempotency_key_required');
  end if;
  select * into v_version from public.menu_versions where id = p_version_id;
  if not found then
    perform app.fail(404, 'not_found');
  end if;
  select * into v_menu from public.menus where id = v_version.menu_id for update;
  v_membership := app.require_permission(v_menu.business_id, 'history.restore');
  perform app.require_active_business(v_menu.business_id);
  if not app.membership_covers_branch(v_membership, v_version.branch_id) then
    perform app.fail(404, 'not_found');
  end if;

  select id into v_existing from public.publications
  where business_id = v_menu.business_id and idempotency_key = p_idempotency_key;
  if found then
    return app.publication_result(v_existing, true);
  end if;

  if v_menu.status <> 'active' then
    perform app.fail(409, 'menu_archived');
  end if;
  if not exists (select 1 from public.menu_branches where menu_id = v_menu.id and branch_id = v_version.branch_id) then
    perform app.fail(409, 'branch_not_in_menu');
  end if;

  if p_restore_draft then
    if not app.membership_covers_menu(v_membership, v_menu.id) then
      perform app.fail(403, 'branch_scope');
    end if;
    if (select count(*) from public.menu_branches where menu_id = v_menu.id) <> 1 then
      perform app.fail(409, 'restore_draft_shared_menu');
    end if;
  end if;

  select published_version_id into v_current_id
  from public.menu_branches where menu_id = v_menu.id and branch_id = v_version.branch_id
  for update;

  if v_current_id is distinct from v_version.id then
    insert into public.publications (business_id, menu_id, source, restored_from_version_id, idempotency_key, published_by, note)
    values (v_menu.business_id, v_menu.id, 'restore', v_version.id, p_idempotency_key, auth.uid(),
            'Restauración de la versión ' || v_version.version_number)
    returning id into v_publication_id;
    v_new := app.write_version(v_menu, v_version.branch_id, v_publication_id, v_version.snapshot, v_version.content_hash);
  end if;

  if p_restore_draft then
    perform app.restore_draft_from_snapshot(v_menu, v_version.branch_id, v_version.snapshot);
  end if;

  perform app.audit(v_menu.business_id, 'menu.restored', 'menu_version', v_version.id,
    'Restauró la versión ' || v_version.version_number || ' de ' || v_menu.name,
    jsonb_build_object('publication_id', v_publication_id, 'restore_draft', p_restore_draft,
                       'new_version_number', v_new.version_number),
    v_version.branch_id);

  return jsonb_build_object(
    'publication_id', v_publication_id,
    'changed', v_publication_id is not null,
    'replayed', false,
    'draft_restored', p_restore_draft,
    'branches', jsonb_build_array(jsonb_build_object(
      'branch_id', v_version.branch_id, 'changed', v_publication_id is not null,
      'version_number', coalesce(v_new.version_number, v_version.version_number))),
    'branch_slugs', (select jsonb_agg(public_slug) from public.branches where id = v_version.branch_id)
  );
end;
$$;
