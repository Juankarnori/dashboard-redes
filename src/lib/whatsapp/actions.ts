"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppTextMessage, WhatsAppNotConfiguredError } from "./client";
import { isWithinServiceWindow } from "./service-window";
import { getConversationDetail } from "./queries";

export interface SendWhatsAppReplyResult {
  error?: string;
}

/**
 * Responde una conversación de WhatsApp desde el dashboard. Solo dentro
 * de la ventana de servicio de 24h (ver service-window.ts) — fuera de
 * ventana, la única opción son plantillas de marketing pre-aprobadas, que
 * son de pago y quedan fuera de alcance (Fase 5 solo hace respuesta manual).
 */
export async function sendWhatsAppReply(
  conversationId: string,
  body: string
): Promise<SendWhatsAppReplyResult> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "Escribí un mensaje." };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const detail = await getConversationDetail(supabase, conversationId);
  if (!detail) return { error: "Conversación no encontrada." };

  if (!isWithinServiceWindow(detail.lastInboundAt)) {
    return {
      error:
        "La ventana de 24h para responder gratis ya cerró. Esperá a que el contacto escriba de nuevo — las plantillas de marketing son de pago y no están soportadas acá.",
    };
  }

  try {
    const waMessageId = await sendWhatsAppTextMessage(detail.contactWaId, trimmed);

    const { error: insertError } = await supabase.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      wa_message_id: waMessageId,
      direction: "out",
      body: trimmed,
      msg_type: "text",
      status: "sent",
    });
    if (insertError) return { error: insertError.message };

    const { error: updateError } = await supabase
      .from("whatsapp_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (updateError) return { error: updateError.message };
  } catch (err) {
    const message =
      err instanceof WhatsAppNotConfiguredError
        ? err.message
        : "No se pudo enviar el mensaje por WhatsApp. Intentá de nuevo.";
    console.error(`No se pudo responder la conversación de WhatsApp ${conversationId}:`, err);
    return { error: message };
  }

  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath("/whatsapp");
  return {};
}
