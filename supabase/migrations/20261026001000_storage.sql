-- CartaLista · Storage
--
-- import-originals (privado): fotos originales de cartas para importar.
-- uploads (privado): fotos de productos, logos y portadas recién subidas, antes
--   de que el servidor las valide y procese.
-- public-media (público): imágenes procesadas (WebP, sin metadatos) que se
--   muestran en la carta. Rutas no adivinables.
--
-- No hay políticas sobre storage.objects para anon/authenticated: las subidas
-- usan URLs firmadas emitidas por el servidor después de autorizar, y las
-- lecturas privadas se hacen con service role o URLs firmadas de corta vida.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('import-originals', 'import-originals', false, 20971520, array['image/jpeg', 'image/png', 'image/webp']),
  ('uploads', 'uploads', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('public-media', 'public-media', true, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
