-- CartaLista · Datos de demostración (solo desarrollo local)
--
-- Se carga con `npm run db:reset` (supabase db reset) en la base LOCAL.
-- Nunca se ejecuta en producción: `supabase db push` no incluye el seed.
-- No crea usuarios ni credenciales. Para entrar como propietario de Casa Oliva,
-- generá un usuario con `npm run demo:user -- --email vos@ejemplo.com`.

do $$
declare
  v_business uuid := '0b9a6a63-6f39-4d47-9a43-1a2f0c5e0001';
  v_palermo uuid := '0b9a6a63-6f39-4d47-9a43-1a2f0c5e0101';
  v_belgrano uuid := '0b9a6a63-6f39-4d47-9a43-1a2f0c5e0102';
  v_menu uuid := '0b9a6a63-6f39-4d47-9a43-1a2f0c5e0201';
  v_entradas uuid := gen_random_uuid();
  v_principales uuid := gen_random_uuid();
  v_pizzas uuid := gen_random_uuid();
  v_postres uuid := gen_random_uuid();
  v_bebidas uuid := gen_random_uuid();
  v_p uuid;
  v_publication uuid;
  v_menu_row public.menus;
  v_branch uuid;
  v_snapshot jsonb;
begin
  insert into public.businesses (id, name, slug, description, currency, locale, brand_color)
  values (v_business, 'Casa Oliva', 'casa-oliva', 'Cocina de bodegón con producto de estación.', 'ARS', 'es-AR', '#7B3F2A');

  insert into public.plan_assignments (business_id, plan_id, note)
  select v_business, id, 'Datos de demostración' from public.plans where code = 'inicial';

  insert into public.branches (id, business_id, name, public_slug, timezone, address, phone, whatsapp, public_note, opening_hours, sort_order)
  values
    (v_palermo, v_business, 'Palermo', 'casa-oliva-palermo', 'America/Argentina/Buenos_Aires',
     'Honduras 4800, Palermo, CABA', '011 4833-0000', '5491100000000',
     'Aceptamos efectivo, débito y crédito. Avisanos si tenés alguna alergia.',
     '[{"day":2,"open":"12:00","close":"16:00"},{"day":2,"open":"20:00","close":"00:30"},
       {"day":3,"open":"12:00","close":"16:00"},{"day":3,"open":"20:00","close":"00:30"},
       {"day":4,"open":"12:00","close":"16:00"},{"day":4,"open":"20:00","close":"00:30"},
       {"day":5,"open":"12:00","close":"16:00"},{"day":5,"open":"20:00","close":"01:30"},
       {"day":6,"open":"12:00","close":"16:30"},{"day":6,"open":"20:00","close":"01:30"},
       {"day":0,"open":"12:00","close":"16:30"}]'::jsonb, 0),
    (v_belgrano, v_business, 'Belgrano', 'casa-oliva-belgrano', 'America/Argentina/Buenos_Aires',
     'Av. Cabildo 2100, Belgrano, CABA', '011 4780-0000', '',
     'Tenemos opciones sin TACC: consultá al personal.',
     '[{"day":1,"open":"12:00","close":"23:30"},{"day":2,"open":"12:00","close":"23:30"},
       {"day":3,"open":"12:00","close":"23:30"},{"day":4,"open":"12:00","close":"23:30"},
       {"day":5,"open":"12:00","close":"00:30"},{"day":6,"open":"12:00","close":"00:30"},
       {"day":0,"open":"12:00","close":"23:30"}]'::jsonb, 1);

  insert into public.menus (id, business_id, name, description, sort_order)
  values (v_menu, v_business, 'Carta principal', 'Mediodía y noche', 0);
  insert into public.menu_branches (business_id, menu_id, branch_id, sort_order)
  values (v_business, v_menu, v_palermo, 0), (v_business, v_menu, v_belgrano, 0);

  insert into public.categories (id, business_id, menu_id, name, sort_order) values
    (v_entradas, v_business, v_menu, 'Entradas', 0),
    (v_principales, v_business, v_menu, 'Principales', 1),
    (v_pizzas, v_business, v_menu, 'Pizzas', 2),
    (v_postres, v_business, v_menu, 'Postres', 3),
    (v_bebidas, v_business, v_menu, 'Bebidas', 4);

  -- Entradas
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, tags, sort_order) values
    (v_business, v_menu, v_entradas, 'Provoleta a la parrilla', 'Provolone fundido con orégano y aceite de oliva.', 980000, 'available', '{}', 0),
    (v_business, v_menu, v_entradas, 'Burrata con tomates asados', 'Burrata cremosa, tomates confitados y pan de campo.', 1390000, 'available', '{vegetariano}', 2),
    (v_business, v_menu, v_entradas, 'Rabas', 'Anillos de calamar rebozados con limón.', 1550000, 'sold_out', '{}', 3);
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order)
  values (v_business, v_menu, v_entradas, 'Empanadas de carne cortada a cuchillo', 'Al horno de barro.', null, 1)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Unidad', 260000, 0),
    (v_business, v_menu, v_p, 'Media docena', 1450000, 1);

  -- Principales
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, tags, sort_order) values
    (v_business, v_menu, v_principales, 'Bife de chorizo con papas rústicas', 'Corte de 400 g a la parrilla.', 2850000, 'available', '{}', 0),
    (v_business, v_menu, v_principales, 'Milanesa napolitana con puré', 'De ternera, con jamón, salsa y muzzarella.', 2190000, 'available', '{para_compartir}', 1),
    (v_business, v_menu, v_principales, 'Ñoquis de papa con salsa pomodoro', 'Hechos en casa.', 1680000, 'available', '{vegetariano}', 2),
    (v_business, v_menu, v_principales, 'Risotto de hongos', 'Arroz carnaroli, hongos de pino y parmesano.', 1950000, 'available', '{vegetariano}', 3);

  -- Pizzas
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, sort_order)
  values (v_business, v_menu, v_pizzas, 'Muzzarella', 'Salsa de tomate, muzzarella y aceitunas.', null, 'available', 0)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Chica', 1150000, 0), (v_business, v_menu, v_p, 'Grande', 1690000, 1);
  insert into public.product_extras (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Doble muzzarella', 250000, 0);

  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, sort_order)
  values (v_business, v_menu, v_pizzas, 'Napolitana', 'Muzzarella, rodajas de tomate, ajo y perejil.', null, 'available', 1)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Chica', 1290000, 0), (v_business, v_menu, v_p, 'Grande', 1850000, 1);

  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, sort_order) values
    (v_business, v_menu, v_pizzas, 'Fugazzeta rellena', 'Rellena de muzzarella, con cebolla.', 2100000, 'available', 2);

  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, status, sort_order)
  values (v_business, v_menu, v_pizzas, 'Calabresa', 'Muzzarella y longaniza calabresa.', null, 'sold_out', 3)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Chica', 1350000, 0), (v_business, v_menu, v_p, 'Grande', 1950000, 1);
  -- En Belgrano la calabresa sí está disponible.
  insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, status)
  values (v_business, v_menu, v_p, v_belgrano, 'available');

  -- Postres
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order)
  values (v_business, v_menu, v_postres, 'Flan casero con dulce de leche', '', 720000, 0)
  returning id into v_p;
  insert into public.product_extras (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Crema', 90000, 0);
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order) values
    (v_business, v_menu, v_postres, 'Tiramisú', 'Con café de especialidad.', 840000, 1),
    (v_business, v_menu, v_postres, 'Panqueques con dulce de leche', '', 780000, 2);

  -- Bebidas
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order)
  values (v_business, v_menu, v_bebidas, 'Agua mineral', 'Con o sin gas.', null, 0)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, '500 ml', 290000, 0), (v_business, v_menu, v_p, '1,5 L', 480000, 1);
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order) values
    (v_business, v_menu, v_bebidas, 'Limonada con menta y jengibre', 'Jarra individual.', 520000, 1);
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order)
  values (v_business, v_menu, v_bebidas, 'Vino Malbec de la casa', 'Mendoza.', null, 2)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Copa', 650000, 0), (v_business, v_menu, v_p, 'Botella', 2600000, 1);
  insert into public.products (business_id, menu_id, category_id, name, description, price_minor, sort_order)
  values (v_business, v_menu, v_bebidas, 'Cerveza tirada', 'Rubia o roja.', null, 3)
  returning id into v_p;
  insert into public.product_variants (business_id, menu_id, product_id, name, price_minor, sort_order) values
    (v_business, v_menu, v_p, 'Media pinta', 450000, 0), (v_business, v_menu, v_p, 'Pinta', 680000, 1);

  -- Precios propios de Belgrano.
  insert into public.product_branch_overrides (business_id, menu_id, product_id, branch_id, price_minor)
  select v_business, v_menu, id, v_belgrano, case name
      when 'Bife de chorizo con papas rústicas' then 2990000
      when 'Provoleta a la parrilla' then 1050000
    end
  from public.products
  where menu_id = v_menu and name in ('Bife de chorizo con papas rústicas', 'Provoleta a la parrilla');

  -- Primera publicación en ambas sucursales.
  select * into v_menu_row from public.menus where id = v_menu;
  insert into public.publications (business_id, menu_id, source, idempotency_key, note)
  values (v_business, v_menu, 'manual', gen_random_uuid(), 'Publicación inicial de demostración')
  returning id into v_publication;
  foreach v_branch in array array[v_palermo, v_belgrano] loop
    v_snapshot := app.build_menu_snapshot(v_menu, v_branch);
    perform app.write_version(v_menu_row, v_branch, v_publication, v_snapshot, app.sha256_hex(v_snapshot::text));
  end loop;
end;
$$;
