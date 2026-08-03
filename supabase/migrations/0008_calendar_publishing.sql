-- Publicación real desde /calendar: agrega a content_calendar lo que
-- faltaba para pasar de "idea planificada" a "pieza publicada" — cuenta
-- destino, archivo, caption final (distinto de `idea`, que sigue siendo
-- el borrador/nota interna) y el resultado de intentar publicar.
alter table content_calendar
  add column account_id      uuid references accounts(id) on delete set null,
  add column caption         text,   -- texto real enviado a la plataforma; si está vacío al publicar se precarga desde `idea` mostrandolo editable, pero de ahí en más son independientes
  add column media_path      text,   -- ruta en el bucket calendar-media (Supabase Storage)
  add column media_type      text,   -- 'image' | 'video'
  add column external_post_id text,  -- media id de Meta, publish_id de TikTok
  add column permalink       text,   -- solo Meta lo devuelve
  add column publish_error   text,
  add column published_at    timestamptz;

create index content_calendar_account_idx on content_calendar (account_id);

-- `status` sigue siendo texto libre (sin check constraint, como ya
-- estaba) pero de acá en más el ciclo real es:
--   idea -> planned -> publishing -> published | draft_sent | failed
-- draft_sent es específico de TikTok Draft: el video ya está en el
-- inbox del creador, pendiente de que la persona lo termine de publicar
-- a mano en la app — nunca se debe mostrar como "publicado".

-- ── Storage: bucket para el archivo a publicar ─────────────────────────
-- Público de lectura (las 3 APIs de destino piden una URL pública, no
-- soportan auth); solo el dueño del negocio puede escribir, y cada
-- archivo vive bajo el prefijo {brand_id}/... para que la política lo
-- pueda validar sin tocar la tabla content_calendar en cada chequeo.
insert into storage.buckets (id, name, public)
values ('calendar-media', 'calendar-media', true)
on conflict (id) do nothing;

create policy "owner reads own calendar media" on storage.objects
  for select using (
    bucket_id = 'calendar-media'
    and (storage.foldername(name))[1]::uuid in (select id from brands where owner_id = auth.uid())
  );

create policy "owner writes own calendar media" on storage.objects
  for insert with check (
    bucket_id = 'calendar-media'
    and (storage.foldername(name))[1]::uuid in (select id from brands where owner_id = auth.uid())
  );

create policy "owner deletes own calendar media" on storage.objects
  for delete using (
    bucket_id = 'calendar-media'
    and (storage.foldername(name))[1]::uuid in (select id from brands where owner_id = auth.uid())
  );
