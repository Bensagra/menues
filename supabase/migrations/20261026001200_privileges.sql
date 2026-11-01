-- CartaLista · Privilegios de ejecución
-- Postgres concede EXECUTE a PUBLIC por defecto y Supabase además a anon y
-- authenticated. Acá se revoca todo y se concede explícitamente.
-- Hay una prueba que verifica la lista blanca de funciones para anon.

alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema app revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;

-- Funciones usadas por políticas RLS (se evalúan con el rol del usuario).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname in ('is_member', 'has_permission', 'can_access_branch', 'can_view_menu', 'shares_business',
                        'is_platform_admin', 'role_permits')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;

-- RPC para usuarios autenticados.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_my_profile', 'slug_available', 'create_business', 'update_business', 'set_business_media',
        'create_branch', 'update_branch',
        'create_invitation', 'revoke_invitation', 'get_invitation', 'accept_invitation', 'accept_invitation_by_id',
        'my_pending_invitations',
        'update_membership', 'revoke_membership',
        'create_menu', 'update_menu', 'archive_menu', 'unarchive_menu', 'duplicate_menu', 'set_menu_branches',
        'create_category', 'update_category', 'reorder_categories', 'delete_category',
        'save_product', 'set_product_status', 'duplicate_product', 'archive_product', 'unarchive_product',
        'reorder_products', 'set_branch_override',
        'get_menu_publish_status', 'get_draft_snapshot', 'publish_menu', 'restore_menu_version',
        'create_import', 'cancel_import', 'retry_import', 'decide_proposal', 'bulk_decide_proposals', 'apply_import',
        'get_public_menu', 'get_processing_status', 'get_ai_quota', 'get_plan_overview'
      )
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;

-- RPC para visitantes sin sesión.
grant execute on function public.get_public_menu(text) to anon;
grant execute on function public.get_invitation(text) to anon;
