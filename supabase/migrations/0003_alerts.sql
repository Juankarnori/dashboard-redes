-- Alertas de oportunidad: engagement_drop | no_posts_streak.
-- Se recalculan por cuenta al final de cada sync completo (scope=all) en
-- /api/sync — delete-and-reinsert, sin campo de estado (ver notas de la Fase 2).
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete cascade,
  type        text not null,           -- engagement_drop | no_posts_streak
  severity    text not null,           -- warning | info
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}',
  detected_at timestamptz not null default now()
);

create index alerts_brand_idx on alerts (brand_id, detected_at desc);
create index alerts_account_type_idx on alerts (account_id, type);

alter table alerts enable row level security;

-- Solo lectura para el dueño: la escritura la hace /api/sync con el
-- admin client (service role, bypasa RLS), igual que sync_logs.
create policy "owner reads own alerts" on alerts
  for select
  using (brand_id in (select id from brands where owner_id = auth.uid()));
