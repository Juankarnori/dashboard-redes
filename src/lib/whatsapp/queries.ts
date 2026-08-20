import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

type DB = SupabaseClient<Database>;

export interface ConversationListItem {
  id: string;
  contactWaId: string;
  contactName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null; // para el chequeo de ventana de 24h en la lista
}

/** Bandeja de WhatsApp: conversaciones más recientes primero. RLS ya filtra por owner_id = auth.uid(). */
export async function getConversations(supabase: DB): Promise<ConversationListItem[]> {
  const { data: conversations } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_wa_id, contact_name, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const conversationIds = conversations.map((c) => c.id);
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("conversation_id, body, direction, sent_at")
    .in("conversation_id", conversationIds)
    .order("sent_at", { ascending: false });

  // Un solo pase, más reciente primero: el primer mensaje que vemos por
  // conversación es el último en general; el primer direction='in' que
  // vemos es el último entrante (para la ventana de 24h).
  const lastMessagePreviewByConv = new Map<string, string | null>();
  const lastInboundByConv = new Map<string, string>();
  for (const m of messages ?? []) {
    if (!lastMessagePreviewByConv.has(m.conversation_id)) {
      lastMessagePreviewByConv.set(m.conversation_id, m.body);
    }
    if (m.direction === "in" && !lastInboundByConv.has(m.conversation_id)) {
      lastInboundByConv.set(m.conversation_id, m.sent_at);
    }
  }

  return conversations.map((c) => ({
    id: c.id,
    contactWaId: c.contact_wa_id,
    contactName: c.contact_name,
    lastMessageAt: c.last_message_at,
    lastMessagePreview: lastMessagePreviewByConv.get(c.id) ?? null,
    lastInboundAt: lastInboundByConv.get(c.id) ?? null,
  }));
}

export interface ConversationMessage {
  id: string;
  direction: "in" | "out";
  body: string | null;
  msgType: string;
  status: string | null;
  sentAt: string;
}

export interface ConversationDetail {
  id: string;
  contactWaId: string;
  contactName: string | null;
  messages: ConversationMessage[];
  lastInboundAt: string | null;
}

/** Hilo completo de una conversación, más viejo primero (se lee como chat). */
export async function getConversationDetail(supabase: DB, conversationId: string): Promise<ConversationDetail | null> {
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_wa_id, contact_name")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, body, msg_type, status, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  const rows = messages ?? [];
  const lastInbound = [...rows].reverse().find((m) => m.direction === "in");

  return {
    id: conversation.id,
    contactWaId: conversation.contact_wa_id,
    contactName: conversation.contact_name,
    messages: rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      msgType: m.msg_type,
      status: m.status,
      sentAt: m.sent_at,
    })),
    lastInboundAt: lastInbound?.sent_at ?? null,
  };
}
