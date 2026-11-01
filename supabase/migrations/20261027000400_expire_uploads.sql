-- CartaLista · Importaciones abandonadas durante la subida
--
-- Una importación en 'uploading' todavía no reservó cuota ni entró a la cola.
-- Si nadie la envía (la persona cerró la pestaña a mitad de la subida), el
-- worker la cancela pasado un tiempo y borra las fotos que hayan llegado al
-- almacenamiento. Devuelve las rutas para que el worker las elimine.

create or replace function public.worker_expire_uploads(p_older_than_minutes int default 1440, p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_paths jsonb;
  v_row record;
begin
  with stale as (
    select id from public.imports
    where status = 'uploading'
      and created_at < now() - make_interval(mins => greatest(coalesce(p_older_than_minutes, 1440), 30))
    order by created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  ),
  updated as (
    update public.imports i
    set status = 'cancelled', stage = 'cancelled', cancelled_at = now(),
        error_code = 'upload_abandoned', error_message = 'Las fotos no se terminaron de subir.'
    from stale
    where i.id = stale.id
    returning i.id, i.business_id
  )
  select coalesce(array_agg(id), '{}') into v_ids from updated;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('expired', 0, 'paths', '[]'::jsonb);
  end if;

  update public.import_images set status = 'failed', error_code = 'upload_abandoned' where import_id = any (v_ids);
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into v_paths from public.import_images where import_id = any (v_ids);

  for v_row in select id, business_id from public.imports where id = any (v_ids) loop
    perform app.audit(v_row.business_id, 'import.expired', 'import', v_row.id,
      'Se canceló una importación cuyas fotos no se terminaron de subir', '{}'::jsonb, null, null, 'worker');
  end loop;

  return jsonb_build_object('expired', cardinality(v_ids), 'paths', v_paths);
end;
$$;

revoke all on function public.worker_expire_uploads(int, int) from public, anon, authenticated;
grant execute on function public.worker_expire_uploads(int, int) to service_role;
