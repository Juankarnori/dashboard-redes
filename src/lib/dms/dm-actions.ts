"use server";

import { createClient } from "@/lib/supabase/server";
import { getDmThread } from "@/lib/dms/queries";
import { buildDmTranscript } from "@/lib/dms/transcript";
import { generateDmReplySuggestion } from "@/lib/anthropic/client";
import { REPLY_TEMPLATE } from "@/lib/analytics/reply-template";

export interface SuggestDmReplyResult {
  error?: string;
  suggestion?: string;
}

/**
 * Borrador de respuesta con IA para un hilo de mensajes — llena el textarea de DmComposer
 * para que el dueño lo revise/edite; nunca se envía sola (acá ni siquiera hay envío
 * todavía, ver sub-parte 6). Usa el HISTORIAL del hilo como contexto (a diferencia de
 * suggestCommentReply, que responde a un único comentario suelto) — así la sugerencia
 * sigue el hilo de la conversación en vez de repetir un saludo. NUNCA loguea el
 * transcript ni la sugerencia.
 */
export async function suggestDmReply(conversationId: string): Promise<SuggestDmReplyResult> {
  const supabase = await createClient();

  const thread = await getDmThread(supabase, conversationId);
  if (!thread) return { error: "Conversación no encontrada." };
  if (thread.messages.length === 0) return { error: "Todavía no hay mensajes en este hilo." };

  const transcript = buildDmTranscript(thread.messages);
  const brandName = thread.brand?.name ?? "el negocio";

  try {
    const suggestion = await generateDmReplySuggestion(brandName, transcript, REPLY_TEMPLATE);
    return { suggestion };
  } catch (err) {
    console.error(`No se pudo generar una sugerencia para el hilo ${conversationId}:`, err instanceof Error ? err.message : err);
    return { error: "No se pudo generar una sugerencia. Intentá de nuevo o escribí la respuesta a mano." };
  }
}
