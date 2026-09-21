-- Mensajes directos (Facebook Messenger + Instagram DM): bandeja de "Mensajes".
--
-- Dos tablas, colgadas de `accounts` igual que `content`/`comments`: cada hilo
-- pertenece a una cuenta conectada, y el dueño lo ve por la cadena
-- accounts -> brands -> owner. TikTok no tiene DMs por API, así que no hay filas
-- de esa red (ni hace falta una columna `platform`: se deduce de accounts).
--
-- Se lee y escribe por Composio; solo entran cuentas con conexión Composio activa.

-- ── Hilos ────────────────────────────────────────────────────────────────
create table dm_conversations (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references accounts(id) on delete cascade,

  -- id del hilo en la red (FB "t_…", IG un id largo). Único por cuenta: el sync
  -- hace upsert por (account_id, external_id) y nunca duplica un hilo.
  external_id            text not null,

  -- El CLIENTE: PSID (Facebook) / IGSID (Instagram). Es exactamente el
  -- `recipient_id` que piden FACEBOOK_SEND_MESSAGE / INSTAGRAM_SEND_TEXT_MESSAGE
  -- para responderle. participant_name = nombre en FB, username en IG (la API de
  -- IG no da nombre). Nunca se guarda el email que devuelve Facebook.
  participant_id         text not null,
  participant_name       text,

  -- CHECKPOINT del sync (mismo patrón que el fix de comentarios de posts viejos):
  -- el `updated_time` del hilo según la red, tal como estaba cuando se bajaron sus
  -- mensajes. Un hilo se vuelve a bajar solo si el listado trae un updated_time
  -- MÁS NUEVO que este. La fila del hilo se crea junto con sus mensajes, así que
  -- "no hay fila" = hilo nuevo por bajar.
  network_updated_at     timestamptz,

  -- Resumen del último mensaje, para pintar la lista sin leer dm_messages.
  last_message_at        timestamptz,
  last_message_text      text,
  last_message_media     text check (last_message_media in ('attachment', 'share', 'story', 'unsupported')),
  last_message_direction text check (last_message_direction in ('in', 'out')),  -- in = cliente, out = negocio

  -- Hora del último mensaje del CLIENTE: base de la ventana de 24h para responder
  -- (Meta bloquea el texto libre fuera de ella). Se guarda la hora, no un booleano
  -- "dentro de ventana", porque se vencería solo con el paso del tiempo: la UI y el
  -- servidor lo calculan al momento (ver lib/dms/window.ts).
  last_inbound_at        timestamptz,

  -- Solo Facebook los informa (Instagram: null). can_reply = si la Página puede
  -- responder hoy según Meta; link = URL para abrir el hilo en el inbox de Meta.
  can_reply              boolean,
  unread_count           integer,
  link                   text,

  -- true = no queda nada del cliente por responder: el último mensaje es del negocio,
  -- o el hilo no tiene ningún mensaje del cliente. Se RECALCULA en cada sync a partir
  -- del último mensaje real (no se confía solo en estado local: así una respuesta
  -- hecha desde la app de Meta también cuenta, como en comentarios).
  replied                boolean not null default false,

  -- Clasificación del tramo pendiente (los mensajes del cliente posteriores a la
  -- última respuesta del negocio; si no hay, el último del cliente) con el mismo
  -- clasificador de leads que los comentarios (lib/analytics/comment-classify.ts).
  sentiment              text check (sentiment in ('positive', 'negative', 'question', 'spam', 'lead', 'neutral')),
  intent_score           integer not null default 0,
  classified_at          timestamptz,

  synced_at              timestamptz not null default now(),
  unique (account_id, external_id)
);

-- Lista de la bandeja: hilos de una cuenta, el más reciente primero.
create index dm_conversations_inbox_idx on dm_conversations (account_id, last_message_at desc);
-- "Sin responder" (y el contador del Resumen): índice parcial, solo lo pendiente.
create index dm_conversations_pending_idx on dm_conversations (account_id, last_message_at desc) where replied = false;

-- ── Mensajes ─────────────────────────────────────────────────────────────
create table dm_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references dm_conversations(id) on delete cascade,

  -- id del mensaje en la red. Único por hilo: reprocesar un hilo no duplica mensajes.
  external_id     text not null,

  direction       text not null check (direction in ('in', 'out')),  -- in = cliente, out = negocio
  author_id       text,
  body            text,   -- texto; vacío cuando el mensaje no es texto (ver media_kind)

  -- Un mensaje sin texto trae la causa aparte. 'unsupported' = la red NO expone el
  -- contenido por API (audios, algunos stickers/reels…): no se puede leer, y la UI
  -- tiene que avisar "abrilo en la app" en vez de mostrar un mensaje en blanco.
  media_kind      text check (media_kind in ('attachment', 'share', 'story', 'unsupported')),

  sent_at         timestamptz not null,
  synced_at       timestamptz not null default now(),
  unique (conversation_id, external_id)
);

create index dm_messages_thread_idx on dm_messages (conversation_id, sent_at);

-- ── Row Level Security ───────────────────────────────────────────────────
alter table dm_conversations enable row level security;
alter table dm_messages enable row level security;

-- El sync (cron, sin sesión de usuario) escribe con la service_role key y bypasa RLS.
-- Estas políticas son para el dashboard: el dueño lee sus hilos y, al responder,
-- inserta el mensaje saliente y actualiza el hilo con su propia sesión (por eso
-- `for all` con `with check`, igual que `comments`).
create policy "owner manages own dm_conversations" on dm_conversations
  for all
  using (
    account_id in (
      select a.id from accounts a
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  )
  with check (
    account_id in (
      select a.id from accounts a
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );

create policy "owner manages own dm_messages" on dm_messages
  for all
  using (
    conversation_id in (
      select c.id from dm_conversations c
      join accounts a on a.id = c.account_id
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select c.id from dm_conversations c
      join accounts a on a.id = c.account_id
      join brands b on b.id = a.brand_id
      where b.owner_id = auth.uid()
    )
  );
