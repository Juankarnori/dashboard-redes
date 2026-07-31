-- Social Pulse — esquema inicial (Fase 1)
-- Multi-negocio, multi-red, contenido individual con snapshots de métricas.
-- Diseñado para agregar TikTok (u otras redes) sin romper el esquema.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────
create type platform_t as enum ('instagram', 'facebook', 'tiktok');
create type content_type_t as enum ('post', 'reel', 'story', 'carousel', 'video');
create type account_role_t as enum ('business', 'creator', 'page');

-- ── brands: los "negocios" que el dueño gestiona ──────────────────────
create table brands (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  slug       text not null,
  color      text not null default '#12615f', -- acento de marca para UI/charts
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

-- ── accounts: cada perfil conectado, por red, colgado de un negocio ──
create table accounts (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id) on delete cascade,
  platform          platform_t not null,
  role              account_role_t not null,
  external_id       text not null,          -- IG user id / FB page id / futuro TikTok id
  username          text,
  display_name      text,
  profile_image_url text,
  access_token      text not null,          -- CIFRADO en la app (ver lib/crypto.ts), nunca en claro
  token_expires_at  timestamptz,
  -- para Instagram Business: la Page de Facebook de la que cuelga
  parent_account_id uuid references accounts(id) on delete set null,
  meta              jsonb not null default '{}',
  status            text not null default 'active', -- active | expired | revoked
  connected_at      timestamptz not null default now(),
  unique (platform, external_id)
);
create index accounts_brand_idx on accounts (brand_id);

-- ── oauth_sessions: puente efímero durante el flujo OAuth de Meta ────
-- Se crea al recibir el callback (guarda las Pages disponibles del usuario
-- de Meta) y se borra tras la selección del dueño. Expira a los 15 min.
create table oauth_sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  brand_id        uuid not null references brands(id) on delete cascade,
  provider        platform_t not null default 'facebook',
  user_access_token text not null, -- cifrado, se descarta tras usarse
  available_pages jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '15 minutes')
);

-- ── content: cada pieza individual (post/reel/story) ──────────────────
create table content (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  external_id   text not null,             -- id del media en la API de origen
  type          content_type_t not null,
  caption       text,
  media_url     text,
  thumbnail_url text,
  permalink     text,
  published_at  timestamptz,
  expires_at    timestamptz,               -- solo historias (24h)
  meta          jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  unique (account_id, external_id)
);
create index content_account_published_idx on content (account_id, published_at desc);
create index content_type_idx on content (type);

-- ── content_metrics: snapshot con fecha por pieza (nunca se actualiza) ─
create table content_metrics (
  id          uuid primary key default gen_random_uuid(),
  content_id  uuid not null references content(id) on delete cascade,
  captured_at timestamptz not null default now(),
  reach       integer,
  impressions integer,
  likes       integer,
  comments    integer,
  shares      integer,
  saves       integer,
  metrics     jsonb not null default '{}', -- específicas: taps_forward, exits, replies…
  unique (content_id, captured_at)
);
create index content_metrics_content_idx on content_metrics (content_id, captured_at desc);

-- ── audience_snapshot: métricas de cuenta (seguidores, demografía) ────
create table audience_snapshot (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  captured_at  timestamptz not null default now(),
  followers    integer,
  follows      integer,
  media_count  integer,
  demographics jsonb not null default '{}',
  unique (account_id, captured_at)
);
create index audience_snapshot_account_idx on audience_snapshot (account_id, captured_at desc);

-- ── recommendations: salida del motor de recomendaciones (Fase 4) ────
create table recommendations (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  account_id   uuid references accounts(id) on delete cascade,
  kind         text not null, -- best_time | top_format | content_idea …
  title        text,
  body         text,
  data         jsonb not null default '{}',
  generated_at timestamptz not null default now()
);
create index recommendations_brand_idx on recommendations (brand_id, generated_at desc);

-- ── content_calendar: planificación editorial (Fase 3/4) ──────────────
create table content_calendar (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  platform      platform_t,
  scheduled_for timestamptz,
  idea          text,
  status        text not null default 'idea', -- idea | planned | published
  source_rec_id uuid references recommendations(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index content_calendar_brand_idx on content_calendar (brand_id, scheduled_for);

-- ── sync_logs: observabilidad de /api/sync (Fase 2) ───────────────────
create table sync_logs (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references accounts(id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text, -- ok | partial | error
  items_synced integer not null default 0,
  error        text
);
create index sync_logs_account_idx on sync_logs (account_id, started_at desc);

-- ── Row Level Security ─────────────────────────────────────────────
alter table brands enable row level security;
alter table accounts enable row level security;
alter table oauth_sessions enable row level security;
alter table content enable row level security;
alter table content_metrics enable row level security;
alter table audience_snapshot enable row level security;
alter table recommendations enable row level security;
alter table content_calendar enable row level security;
alter table sync_logs enable row level security;

create policy "owner reads own brands" on brands
  for select using (owner_id = auth.uid());
create policy "owner writes own brands" on brands
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner reads own accounts" on accounts
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));
create policy "owner writes own accounts" on accounts
  for all using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owner manages own oauth sessions" on oauth_sessions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner reads own content" on content
  for select using (
    account_id in (
      select a.id from accounts a
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );

create policy "owner reads own content_metrics" on content_metrics
  for select using (
    content_id in (
      select c.id from content c
      join accounts a on a.id = c.account_id
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );

create policy "owner reads own audience_snapshot" on audience_snapshot
  for select using (
    account_id in (
      select a.id from accounts a
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );

create policy "owner reads own recommendations" on recommendations
  for select using (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owner manages own content_calendar" on content_calendar
  for all using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));

create policy "owner reads own sync_logs" on sync_logs
  for select using (
    account_id in (
      select a.id from accounts a
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );

-- Nota: /api/sync (Fase 2) correrá con la service_role key (bypassa RLS)
-- porque se dispara desde GitHub Actions sin sesión de usuario.
