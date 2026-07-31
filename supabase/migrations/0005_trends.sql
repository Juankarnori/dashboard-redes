-- Tendencias por negocio (Fase 5): búsqueda web vía Claude, reemplazadas en
-- cada actualización (delete-and-reinsert, igual que best_time/top_format).
create table trends (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  topic       text not null,
  summary     text,
  source_url  text,
  data        jsonb not null default '{}',
  captured_at timestamptz not null default now()
);

create index trends_brand_idx on trends (brand_id, captured_at desc);

alter table trends enable row level security;

-- for all (no solo lectura): lo dispara el usuario desde el dashboard con
-- el cliente de sesión, no /api/sync con admin client.
create policy "owner manages own trends" on trends
  for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));
