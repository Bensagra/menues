-- CartaLista · Precios masivos
--
-- El servidor calcula la vista previa con los datos actuales y envía la lista
-- explícita de cambios. Esta función los aplica al BORRADOR en una sola
-- transacción: verifica permisos y alcance de sucursales, bloquea cada fila y
-- comprueba que el precio siga siendo el de la vista previa (si alguien lo
-- cambió, no se aplica nada). La carta pública no cambia hasta publicar.

create table public.price_bulk_operations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  menu_id uuid not null,
  branch_id uuid,
  idempotency_key uuid not null,
  rule jsonb not null default '{}'::jsonb,
  change_count int not null check (change_count >= 0),
  applied_by uuid references auth.users (id) on delete set null,
  applied_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (business_id, menu_id) references public.menus (business_id, id) on delete cascade,
  foreign key (business_id, branch_id) references public.branches (business_id, id) on delete cascade
);

create index price_bulk_operations_menu on public.price_bulk_operations (menu_id, applied_at desc);

alter table public.price_bulk_operations enable row level security;

create policy price_bulk_operations_select on public.price_bulk_operations for select to authenticated
  using (app.can_view_menu(business_id, menu_id) and (branch_id is null or app.can_access_branch(business_id, branch_id)));

grant select on public.price_bulk_operations to authenticated;

create or replace function public.apply_price_changes(
  p_menu_id uuid,
  p_branch_id uuid,
  p_rule jsonb,
  p_changes jsonb,
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
  v_existing public.price_bulk_operations;
  v_item jsonb;
  v_target text;
  v_to bigint;
  v_stored_from bigint;
  v_base_from bigint;
  v_current bigint;
  v_product public.products;
  v_variant public.product_variants;
  v_count int := 0;
  v_operation_id uuid;
  v_branch_name text;
begin
  perform app.require_user();
  if p_idempotency_key is null then
    perform app.fail(422, 'idempotency_key_required');
  end if;
  select * into v_menu from public.menus where id = p_menu_id;
  if not found or not app.can_view_menu(v_menu.business_id, v_menu.id) then
    perform app.fail(404, 'not_found');
  end if;

  -- Reintentos con la misma clave devuelven el resultado anterior.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from public.price_bulk_operations
  where business_id = v_menu.business_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('operation_id', v_existing.id, 'changed', v_existing.change_count, 'replayed', true,
                              'branch_slugs', app.menu_branch_slugs(v_menu.id));
  end if;

  if p_branch_id is null then
    -- El precio general afecta a todas las sucursales de la carta: hace falta alcance sobre todas.
    v_menu := app.require_menu_edit(p_menu_id);
  else
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
    select name into v_branch_name from public.branches where id = p_branch_id;
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    perform app.fail(422, 'no_price_changes');
  end if;
  if jsonb_array_length(p_changes) > 3000 then
    perform app.fail(422, 'too_many_price_changes');
  end if;

  for v_item in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_item) <> 'object' then
      perform app.fail(422, 'invalid_price_change');
    end if;
    v_target := v_item ->> 'target';
    v_to := app.jsonb_bigint(v_item -> 'to');
    v_stored_from := app.jsonb_bigint(v_item -> 'stored_from');
    v_base_from := app.jsonb_bigint(v_item -> 'base_from');
    if v_to is null then
      perform app.fail(422, 'invalid_price');
    end if;
    perform app.check_price(v_to, 'price_minor');

    if v_target in ('product', 'product_branch') then
      select * into v_product from public.products
      where id = (v_item ->> 'product_id')::uuid and menu_id = v_menu.id and archived_at is null
      for update;
    elsif v_target in ('variant', 'variant_branch') then
      select * into v_variant from public.product_variants
      where id = (v_item ->> 'variant_id')::uuid and menu_id = v_menu.id
      for update;
      if not found then
        perform app.fail(409, 'price_conflict');
      end if;
      select * into v_product from public.products
      where id = v_variant.product_id and menu_id = v_menu.id and archived_at is null
      for update;
    else
      perform app.fail(422, 'invalid_price_change');
    end if;
    if v_product.id is null then
      perform app.fail(409, 'price_conflict');
    end if;
    if (p_branch_id is null) <> (v_target in ('product', 'variant')) then
      perform app.fail(422, 'invalid_price_change');
    end if;

    if v_target = 'product' then
      if v_product.price_minor is distinct from v_stored_from then
        perform app.fail(409, 'price_conflict', v_product.name);
      end if;
      update public.products set price_minor = v_to, revision = revision + 1, updated_by = auth.uid()
      where id = v_product.id;
    elsif v_target = 'variant' then
      if v_variant.price_minor is distinct from v_stored_from then
        perform app.fail(409, 'price_conflict', v_product.name);
      end if;
      update public.product_variants set price_minor = v_to where id = v_variant.id;
      update public.products set revision = revision + 1, updated_by = auth.uid() where id = v_product.id;
    elsif v_target = 'product_branch' then
      select price_minor into v_current from public.product_branch_overrides
      where product_id = v_product.id and branch_id = p_branch_id
      for update;
      if v_current is distinct from v_stored_from
         or (v_stored_from is null and v_product.price_minor is distinct from v_base_from) then
        perform app.fail(409, 'price_conflict', v_product.name);
      end if;
      insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, price_minor, status, updated_by)
      values (v_menu.business_id, v_menu.id, v_product.id, p_branch_id, v_to, null, auth.uid())
      on conflict (product_id, branch_id) do update
        set price_minor = excluded.price_minor, updated_by = excluded.updated_by, updated_at = now();
    else
      select price_minor into v_current from public.variant_branch_prices
      where variant_id = v_variant.id and branch_id = p_branch_id
      for update;
      if v_current is distinct from v_stored_from
         or (v_stored_from is null and v_variant.price_minor is distinct from v_base_from) then
        perform app.fail(409, 'price_conflict', v_product.name);
      end if;
      insert into public.variant_branch_prices (business_id, menu_id, variant_id, branch_id, price_minor, updated_by)
      values (v_menu.business_id, v_menu.id, v_variant.id, p_branch_id, v_to, auth.uid())
      on conflict (variant_id, branch_id) do update
        set price_minor = excluded.price_minor, updated_by = excluded.updated_by, updated_at = now();
    end if;

    v_count := v_count + 1;
    v_product := null;
    v_variant := null;
    v_current := null;
  end loop;

  insert into public.price_bulk_operations (business_id, menu_id, branch_id, idempotency_key, rule, change_count, applied_by)
  values (v_menu.business_id, v_menu.id, p_branch_id, p_idempotency_key, coalesce(p_rule, '{}'::jsonb), v_count, auth.uid())
  returning id into v_operation_id;

  perform app.audit(v_menu.business_id, 'menu.prices_bulk_updated', 'menu', v_menu.id,
    'Actualizó ' || v_count || case when v_count = 1 then ' precio' else ' precios' end || ' de «' || v_menu.name || '»'
      || case when v_branch_name is null then ' (precio general)' else ' en ' || v_branch_name end,
    jsonb_build_object('rule', coalesce(p_rule, '{}'::jsonb), 'count', v_count), p_branch_id);

  return jsonb_build_object('operation_id', v_operation_id, 'changed', v_count, 'replayed', false,
                            'branch_slugs', app.menu_branch_slugs(v_menu.id));
end;
$$;

revoke all on function public.apply_price_changes(uuid, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.apply_price_changes(uuid, uuid, jsonb, jsonb, uuid) to authenticated, service_role;
