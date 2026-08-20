-- Reportes semanales por plantilla (Fase 4) — sin IA, se arman en
-- TypeScript a partir de las mismas queries que ya usan Resumen/
-- Recomendaciones/Alertas. Se generan por negocio (brand), uno por
-- semana; `unique` evita duplicar si el cron se re-corre para la misma
-- semana (upsert en vez de insert).
create table reports (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  week_start  date not null,
  body        text not null,
  metrics     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (brand_id, week_start)
);

create index reports_brand_idx on reports (brand_id, week_start desc);

alter table reports enable row level security;

-- Mismo patrón que alerts/sync_logs: solo lectura para el dueño, la
-- escritura la hace /api/reports/weekly con el admin client (service
-- role, protegido con SYNC_CRON_SECRET — ver sync-auth.ts).
create policy "owner reads own reports" on reports
  for select
  using (brand_id in (select id from brands where owner_id = auth.uid()));
