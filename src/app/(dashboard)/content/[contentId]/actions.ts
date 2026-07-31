"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { getProvider } from "@/lib/platforms";

export interface ReplyToCommentResult {
  error?: string;
}

/** Publica una respuesta a un comentario en Meta y la guarda como hilo local. */
export async function replyToComment(commentId: string, message: string): Promise<ReplyToCommentResult> {
  const trimmed = message.trim();
  if (!trimmed) return { error: "Escribí una respuesta." };

  const supabase = await createClient();

  const { data: comment } = await supabase
    .from("comments")
    .select("id, content_id, platform_comment_id")
    .eq("id", commentId)
    .maybeSingle();
  if (!comment) return { error: "Comentario no encontrado." };

  const { data: content } = await supabase
    .from("content")
    .select("id, account_id")
    .eq("id", comment.content_id)
    .maybeSingle();
  if (!content) return { error: "Contenido no encontrado." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, platform, external_id, access_token")
    .eq("id", content.account_id)
    .maybeSingle();
  if (!account) return { error: "Cuenta no encontrada." };

  const provider = getProvider(account.platform);
  if (!provider.postCommentReply) {
    return { error: `Responder comentarios todavía no está soportado para ${account.platform}.` };
  }

  try {
    const accessToken = decryptToken(account.access_token);
    const providerAccount = { id: account.id, externalId: account.external_id, accessToken };
    const replyExternalId = await provider.postCommentReply(comment.platform_comment_id, trimmed, providerAccount);

    const { error: insertError } = await supabase.from("comments").insert({
      content_id: comment.content_id,
      platform_comment_id: replyExternalId,
      parent_comment_id: comment.id,
      text: trimmed,
      is_business_reply: true,
    });
    if (insertError) return { error: insertError.message };

    const { error: updateError } = await supabase
      .from("comments")
      .update({ replied: true })
      .eq("id", comment.id);
    if (updateError) return { error: updateError.message };
  } catch (err) {
    console.error(`No se pudo responder el comentario ${commentId}:`, err);
    return { error: "No se pudo publicar la respuesta en Meta. Intentá de nuevo." };
  }

  revalidatePath(`/content/${comment.content_id}`);
  return {};
}
