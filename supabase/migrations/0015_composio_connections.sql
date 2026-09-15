-- Fase 1 (Composio): mapea cada cuenta conectada vía Composio a su
-- negocio, sin tocar `accounts` (esa tabla sigue siendo la integración
-- directa actual — se retira cuenta por cuenta a medida que su
-- equivalente en Composio quede verificado, no de una).
--
-- `account_id` es opcional a propósito: permite enlazar esta conexión
-- con la fila ya existente en `accounts` para la MISMA cuenta real
-- (útil cuando migremos esa cuenta puntual más adelante), pero no es
-- obligatorio — para la Fase 1 (Analíticas de IG por Composio) alcanza
-- con esta tabla sola, no hace falta tocar /api/sync ni
-- lib/platforms/index.ts todavía (eso es Fase 3).
create table composio_connections (
  id                              uuid primary key default gen_random_uuid(),
  brand_id                        uuid not null references brands(id) on delete cascade,
  platform                        platform_t not null,
  account_id                      uuid references accounts(id) on delete set null,
  -- "userId" que se le pasa a composio.tools.execute(...) / connectedAccounts.*
  -- — en Composio identifica al dueño de la conexión, no a la cuenta en sí.
  composio_user_id                text not null,
  composio_connected_account_id   text not null,
  alias                           text,
  external_username               text,
  status                          text not null default 'active', -- active | inactive | failed (espejo de connectedAccount.status)
  connected_at                    timestamptz not null default now(),
  unique (platform, composio_connected_account_id)
);

create index composio_connections_brand_idx on composio_connections (brand_id, platform);

alter table composio_connections enable row level security;

create policy "owner manages own composio_connections" on composio_connections
  for all
  using (brand_id in (select id from brands where owner_id = auth.uid()))
  with check (brand_id in (select id from brands where owner_id = auth.uid()));
