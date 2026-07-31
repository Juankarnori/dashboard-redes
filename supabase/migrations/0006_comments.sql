-- Gestión de comentarios: comentarios individuales por pieza de contenido
-- (no solo el conteo agregado que ya vive en content_metrics), con hilo
-- de respuestas y flujo para responder desde la app.
create table comments (
  id                   uuid primary key default gen_random_uuid(),
  content_id           uuid not null references content(id) on delete cascade,
  platform_comment_id  text not null,
  parent_comment_id    uuid references comments(id) on delete cascade,
  author_name          text,
  author_platform_id   text,
  text                 text not null,
  like_count           integer,
  commented_at         timestamptz,
  replied              boolean not null default false,
  is_business_reply    boolean not null default false,
  synced_at            timestamptz not null default now(),
  unique (content_id, platform_comment_id)
);

create index comments_content_idx on comments (content_id, commented_at desc);

alter table comments enable row level security;

-- Mismo patrón de join que content_metrics (content -> accounts -> brands).
-- for all: el flujo de respuesta necesita insertar (nuestra respuesta) y
-- actualizar (marcar replied=true) desde el cliente con sesión.
create policy "owner manages own comments" on comments
  for all
  using (
    content_id in (
      select c.id from content c
      join accounts a on a.id = c.account_id
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  )
  with check (
    content_id in (
      select c.id from content c
      join accounts a on a.id = c.account_id
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );
