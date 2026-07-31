-- Planificador de campañas: agrupan piezas de content_calendar (Fase 3).
create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands(id) on delete cascade,
  name       text not null,
  objective  text,
  color      text not null default '#12615f',
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index campaigns_brand_idx on campaigns (brand_id, start_date);

alter table campaigns enable row level security;

create policy "owner manages own campaigns" on campaigns
  for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

-- content_calendar ya existía (schema original) sin UI. Le sumo el link
-- opcional a campaña.
alter table content_calendar
  add column campaign_id uuid references campaigns(id) on delete set null;

create index content_calendar_campaign_idx on content_calendar (campaign_id);
