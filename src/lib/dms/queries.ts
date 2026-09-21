import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform, CommentSentiment, DmDirection, DmMediaKind } from "@/types/db";
import { getFilteredAccounts, type OverviewFilters } from "@/lib/analytics/queries";

type DB = SupabaseClient<Database>;

/** Hilo tal como lo pinta la lista de /messages. No incluye participant_id (PSID/IGSID): no hace falta en la lista. */
export interface DmInboxItem {
  id: string;
  participant_name: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_media: DmMediaKind | null;
  last_message_direction: DmDirection | null;
  last_inbound_at: string | null;
  can_reply: boolean | null;
  replied: boolean;
  sentiment: CommentSentiment | null;
  intent_score: number;
  platform: Platform;
  account_label: string;
  brand: { name: string; color: string } | null;
}

const INBOX_COLUMNS =
  "id, account_id, participant_name, last_message_at, last_message_text, last_message_media, last_message_direction, last_inbound_at, can_reply, replied, sentiment, intent_score";

/**
 * Hilos de todas las cuentas que pasan `filters` (negocio/red), el más reciente primero. El
 * split Sin responder / Todos y el filtro de sentimiento se hacen en el cliente sobre este
 * mismo array, igual que en la bandeja de comentarios (ver CommentInbox.tsx). Los hilos que
 * no tienen ningún mensaje del cliente vienen con replied=true: no cuentan como pendientes.
 *
 * TikTok no tiene DMs por API: nunca hay filas de esa red, así que filtrar por TikTok da
 * una lista vacía (la UI lo explica).
 */
export async function getDmInbox(supabase: DB, filters: OverviewFilters, limit = 300): Promise<DmInboxItem[]> {
  const accounts = await getFilteredAccounts(supabase, filters);
  if (accounts.length === 0) return [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const { data } = await supabase
    .from("dm_conversations")
    .select(INBOX_COLUMNS)
    .in("account_id", Array.from(accountById.keys()))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  const items: DmInboxItem[] = [];
  for (const row of data ?? []) {
    const account = accountById.get(row.account_id);
    if (!account) continue;
    items.push({
      id: row.id,
      participant_name: row.participant_name,
      last_message_at: row.last_message_at,
      last_message_text: row.last_message_text,
      last_message_media: row.last_message_media,
      last_message_direction: row.last_message_direction,
      last_inbound_at: row.last_inbound_at,
      can_reply: row.can_reply,
      replied: row.replied,
      sentiment: row.sentiment,
      intent_score: row.intent_score,
      platform: account.platform,
      account_label: account.display_name ?? account.username ?? account.platform,
      brand: (account as unknown as { brands: { name: string; color: string } | null }).brands,
    });
  }
  return items;
}

export interface DmThreadMessage {
  id: string;
  direction: DmDirection;
  body: string | null;
  media_kind: DmMediaKind | null;
  sent_at: string;
}

export interface DmThread {
  conversation: {
    id: string;
    account_id: string;
    participant_id: string;
    participant_name: string | null;
    last_inbound_at: string | null;
    can_reply: boolean | null;
    link: string | null;
    replied: boolean;
    sentiment: CommentSentiment | null;
    intent_score: number;
  };
  platform: Platform;
  account_label: string;
  brand: { name: string; color: string } | null;
  messages: DmThreadMessage[];
}

/**
 * Un hilo con sus mensajes (del más viejo al más nuevo) para /messages/[conversationId]. RLS
 * limita a hilos del dueño: si no es suyo o no existe, devuelve null. Acá SÍ va participant_id
 * (es el recipient_id que el servidor usa para responder) — pero solo lo consume código de
 * servidor; la página no debe pasarlo al cliente.
 */
export async function getDmThread(supabase: DB, conversationId: string): Promise<DmThread | null> {
  const { data: conv } = await supabase
    .from("dm_conversations")
    .select(
      "id, account_id, participant_id, participant_name, last_inbound_at, can_reply, link, replied, sentiment, intent_score, accounts(platform, display_name, username, brands(name, color))"
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return null;

  const account = (conv as unknown as {
    accounts: { platform: Platform; display_name: string | null; username: string | null; brands: { name: string; color: string } | null };
  }).accounts;

  const { data: messages } = await supabase
    .from("dm_messages")
    .select("id, direction, body, media_kind, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  return {
    conversation: {
      id: conv.id,
      account_id: conv.account_id,
      participant_id: conv.participant_id,
      participant_name: conv.participant_name,
      last_inbound_at: conv.last_inbound_at,
      can_reply: conv.can_reply,
      link: conv.link,
      replied: conv.replied,
      sentiment: conv.sentiment,
      intent_score: conv.intent_score,
    },
    platform: account.platform,
    account_label: account.display_name ?? account.username ?? account.platform,
    brand: account.brands,
    messages: messages ?? [],
  };
}
