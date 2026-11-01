-- CartaLista · Fundaciones
-- Extensiones, esquema privado `app` y funciones utilitarias puras.
-- El esquema `app` no está expuesto por la Data API: sus funciones solo se usan
-- desde políticas RLS, triggers y otras funciones.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Errores de dominio
-- PostgREST traduce SQLSTATE 'PTxyz' a HTTP xyz. El mensaje es un código estable
-- que la aplicación traduce a texto en español.
-- ---------------------------------------------------------------------------
create or replace function app.fail(p_status int, p_code text, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT' || p_status::text,
    message = p_code,
    detail = coalesce(p_detail, '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Normalización de nombres para comparar (no se usa para mostrar).
-- minúsculas, sin tildes, sin signos, espacios simples.
-- ---------------------------------------------------------------------------
create or replace function app.name_key(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value, ''))),
      '[^a-z0-9]+', ' ', 'g'
    )
  );
$$;

create or replace function app.is_valid_slug(p_slug text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_slug is not null
     and char_length(p_slug) between 3 and 60
     and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
$$;

-- Exponente ISO 4217 de las monedas soportadas. Mantener sincronizado con
-- src/domain/money.ts (hay una prueba que lo verifica).
create or replace function app.currency_exponent(p_currency text)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_currency
    when 'ARS' then 2
    when 'USD' then 2
    when 'EUR' then 2
    when 'UYU' then 2
    when 'BRL' then 2
    when 'MXN' then 2
    when 'PEN' then 2
    when 'COP' then 2
    when 'BOB' then 2
    when 'CLP' then 0
    when 'PYG' then 0
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Contraste WCAG 2.x entre dos colores #RRGGBB.
-- ---------------------------------------------------------------------------
create or replace function app.relative_luminance(p_hex text)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_channels numeric[] := array[]::numeric[];
  v_value numeric;
  i int;
begin
  if p_hex !~ '^#[0-9A-Fa-f]{6}$' then
    return null;
  end if;
  for i in 0..2 loop
    v_value := ('x' || lpad(substr(p_hex, 2 + i * 2, 2), 8, '0'))::bit(32)::int / 255.0;
    if v_value <= 0.04045 then
      v_value := v_value / 12.92;
    else
      v_value := power((v_value + 0.055) / 1.055, 2.4);
    end if;
    v_channels := array_append(v_channels, v_value);
  end loop;
  return 0.2126 * v_channels[1] + 0.7152 * v_channels[2] + 0.0722 * v_channels[3];
end;
$$;

create or replace function app.contrast_ratio(p_a text, p_b text)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_la numeric := app.relative_luminance(p_a);
  v_lb numeric := app.relative_luminance(p_b);
begin
  if v_la is null or v_lb is null then
    return null;
  end if;
  return (greatest(v_la, v_lb) + 0.05) / (least(v_la, v_lb) + 0.05);
end;
$$;

-- Un color de marca es legible si alcanza AA (4.5:1) con texto blanco encima y
-- sobre el fondo de la carta (#F7F5EF), donde se usa para títulos y acentos.
create or replace function app.is_legible_brand_color(p_hex text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_hex is not null
     and p_hex ~ '^#[0-9A-Fa-f]{6}$'
     and app.contrast_ratio(p_hex, '#FFFFFF') >= 4.5
     and app.contrast_ratio(p_hex, '#F7F5EF') >= 4.5;
$$;

-- ---------------------------------------------------------------------------
-- Triggers genéricos
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Token aleatorio URL-safe (256 bits) y su hash.
create or replace function app.random_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function app.sha256_hex(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$$;
