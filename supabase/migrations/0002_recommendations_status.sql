-- Banco de ideas persistente: kanban de recommendations (pending | in_progress | published).
alter table recommendations
  add column status text not null default 'pending';

alter table recommendations
  add constraint recommendations_status_check
  check (status in ('pending', 'in_progress', 'published'));

create index recommendations_status_idx on recommendations (brand_id, status);

-- Bug existente: no había política de escritura para el cliente con sesión
-- (insert/delete en recommendations/actions.ts corrían bajo RLS sin permiso
-- y fallaban en silencio). El kanban además necesita poder actualizar
-- `status`, así que se reemplaza la política de solo lectura por una de
-- lectura+escritura, igual que ya tiene content_calendar.
drop policy if exists "owner reads own recommendations" on recommendations;

create policy "owner manages own recommendations" on recommendations
  for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));
