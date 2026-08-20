-- WhatsApp Cloud API (Fase 5): bandeja manual para leer y responder, sin
-- auto-respuesta. Canal aparte del modelo de content/comments — no cuelga
-- de `brands` (WhatsApp es un solo número de negocio, no por cuenta/red),
-- así que usa el mismo patrón que oauth_sessions: owner_id directo contra
-- auth.users en vez de encadenar por brand_id.
create table whatsapp_conversations (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  contact_wa_id   text not null unique,
  contact_name    text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create index whatsapp_conversations_owner_idx on whatsapp_conversations (owner_id, last_message_at desc);

create table whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  wa_message_id   text unique, -- id que devuelve Meta; único pero nullable (Postgres permite varios null)
  direction       text not null check (direction in ('in', 'out')),
  body            text,
  msg_type        text not null default 'text',
  status          text, -- sent | delivered | read | failed (actualizado por el webhook de statuses)
  sent_at         timestamptz not null default now()
);

create index whatsapp_messages_conversation_idx on whatsapp_messages (conversation_id, sent_at asc);

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

-- El webhook (sin sesión de usuario) escribe con el admin client, igual
-- que /api/sync — bypasa RLS. Estas políticas son para el dashboard.
create policy "owner manages own whatsapp_conversations" on whatsapp_conversations
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owner manages own whatsapp_messages" on whatsapp_messages
  for all
  using (conversation_id in (select id from whatsapp_conversations where owner_id = auth.uid()))
  with check (conversation_id in (select id from whatsapp_conversations where owner_id = auth.uid()));
