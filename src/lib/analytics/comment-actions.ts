"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { resolveProviderForAccount } from "@/lib/platforms";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { syncAccountComments } from "@/lib/analytics/comments-sync";

export interface ReplyToCommentResult {
  error?: string;
}

/**
 * Publica una respuesta a un comentario en Meta y la guarda como hilo
 * local. Compartida entre el detalle de contenido (/content/[id]) y la
 * bandeja centralizada (/comments) — una sola fuente de verdad para el
 * flujo de "responder".
 */
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
    .select("*")
    .eq("id", content.account_id)
    .maybeSingle();
  if (!account) return { error: "Cuenta no encontrada." };

  const { provider, composio } = await resolveProviderForAccount(supabase, account.id, account.platform);
  if (!provider.postCommentReply) {
    return { error: `Responder comentarios todavía no está soportado para ${account.platform}.` };
  }

  try {
    const accessToken = decryptToken(account.access_token);
    const refreshToken = account.refresh_token ? decryptToken(account.refresh_token) : undefined;
    const providerAccount = await refreshAccountTokenIfNeeded(
      supabase,
      provider,
      {
        id: account.id,
        externalId: account.external_id,
        accessToken,
        refreshToken,
        tokenExpiresAt: account.token_expires_at,
        composio,
      },
      account.id
    );
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
  revalidatePath("/comments");
  return {};
}

export interface RefreshCommentsResult {
  error?: string;
  synced?: number;
}

/**
 * Botón "Actualizar ahora" de /comments: sincroniza comentarios de todas
 * las cuentas activas (un solo dueño, así que "activas" = "del dueño")
 * on-demand, sin esperar al cron de GitHub Actions. Mismo camino que
 * `/api/sync?scope=comments` (ver `syncAccountComments`), pero invocado
 * directo como server action en vez de por HTTP.
 */
export async function refreshCommentsNow(): Promise<RefreshCommentsResult> {
  const supabase = await createClient();

  const { data: accounts, error } = await supabase.from("accounts").select("id").eq("status", "active");
  if (error) return { error: error.message };
  if (!accounts || accounts.length === 0) return { synced: 0 };

  let synced = 0;
  for (const account of accounts) {
    try {
      synced += await syncAccountComments(supabase, account.id);
    } catch (err) {
      console.error(`[comments] No se pudo actualizar comentarios de la cuenta ${account.id}:`, err);
    }
  }

  revalidatePath("/comments");
  return { synced };
}
