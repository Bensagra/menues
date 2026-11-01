-- CartaLista · Consultas de administración y privilegios por defecto
--
-- 1) Privilegios por defecto. Los "default privileges" por esquema solo pueden
--    agregar permisos a los globales, y el global de Postgres concede EXECUTE a
--    PUBLIC en toda función nueva. Sin esta línea, cualquier función creada en
--    una migración posterior quedaría ejecutable por anon y authenticated.
--    Desde acá, toda función nueva nace cerrada y se concede explícitamente.

alter default privileges for role postgres revoke execute on functions from public;

-- 2) Listado de usuarios para el panel de plataforma: necesita datos de
--    auth.users (confirmación y último ingreso) que no se exponen por PostgREST.
create or replace function public.admin_list_users(p_actor_id uuid, p_query text, p_limit int, p_offset int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text;
  v_total int;
  v_rows jsonb;
begin
  perform app.require_platform_admin(p_actor_id);
  if v_query is not null then
    v_pattern := '%' || replace(replace(replace(lower(left(v_query, 80)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select count(*) into v_total
  from auth.users u
  left join public.profiles p on p.id = u.id
  where v_pattern is null or lower(u.email) like v_pattern or lower(coalesce(p.full_name, '')) like v_pattern;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) into v_rows
  from (
    select
      u.id,
      u.email,
      coalesce(p.full_name, '') as full_name,
      u.created_at,
      u.email_confirmed_at,
      u.last_sign_in_at,
      exists (select 1 from public.platform_admins a where a.user_id = u.id) as is_platform_admin,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'business_id', b.id, 'business_name', b.name, 'role', m.role, 'can_publish', m.can_publish, 'status', m.status
        ) order by b.name)
        from public.memberships m
        join public.businesses b on b.id = m.business_id
        where m.user_id = u.id
      ), '[]'::jsonb) as memberships
    from auth.users u
    left join public.profiles p on p.id = u.id
    where v_pattern is null or lower(u.email) like v_pattern or lower(coalesce(p.full_name, '')) like v_pattern
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_list_users(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.admin_list_users(uuid, text, int, int) to service_role;
