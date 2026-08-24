import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import type { PlatformProvider, ProviderAccount, ProviderComment } from "@/lib/platforms/types";
import { decryptToken } from "@/lib/crypto";
import { getProvider } from "@/lib/platforms";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { classifyComment } from "@/lib/analytics/comment-classify";

type DB = SupabaseClient<Database>;

/**
 * Ventana de contenido "reciente" para el scope=comments de /api/sync —
 * evita pedir comentarios de todo el historial en cada corrida y reventar
 * el timeout de 10s de Vercel Hobby en cuentas con mucho contenido viejo.
 */
export const COMMENTS_LOOKBACK_DAYS = 14;

/**
 * Sincroniza comentarios del contenido reciente de una cuenta. No fatal
 * por pieza: si una falla, sigue con las demás. Devuelve la cantidad de
 * comentarios (incluidas respuestas) procesados.
 */
export async function syncCommentsForAccount(
  supabase: DB,
  provider: PlatformProvider,
  providerAccount: ProviderAccount,
  accountId: string
): Promise<number> {
  if (!provider.fetchComments) return 0;

  const cutoff = new Date(Date.now() - COMMENTS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(
    `[comments-sync] account=${accountId} cutoff=${cutoff} (ventana de ${COMMENTS_LOOKBACK_DAYS} días)`
  );

  // Diagnóstico (1): traemos TODO el content de la cuenta (no solo lo que
  // pasa el filtro) para poder loguear, pieza por pieza, si quedó dentro
  // o fuera de la ventana — así se ve si el corte del filtro es el problema.
  const { data: allContent, error: contentQueryError } = await supabase
    .from("content")
    .select("id, external_id, published_at")
    .eq("account_id", accountId);

  if (contentQueryError) {
    console.error(`[comments-sync] account=${accountId} error consultando content:`, contentQueryError);
    return 0;
  }

  const recentContent = (allContent ?? []).filter((c) => !!c.published_at && c.published_at >= cutoff);

  for (const c of allContent ?? []) {
    const included = !!c.published_at && c.published_at >= cutoff;
    console.log(
      `[comments-sync] content_id=${c.id} external_id=${c.external_id} published_at=${c.published_at ?? "null"} incluido_en_ventana=${included}`
    );
  }
  console.log(
    `[comments-sync] account=${accountId} content total=${(allContent ?? []).length} dentro de ventana=${recentContent.length}`
  );

  let synced = 0;
  for (const content of recentContent) {
    try {
      // Diagnóstico (2): confirma que efectivamente se llama a
      // fetchComments para este content_id/external_id puntual.
      console.log(
        `[comments-sync] pidiendo comentarios: content_id=${content.id} external_id=${content.external_id}`
      );
      const comments = await provider.fetchComments(content.external_id, providerAccount);
      // Diagnóstico (3): shape ya normalizado (ProviderComment[]) que
      // llega desde el provider — la respuesta verdaderamente cruda de
      // Meta se loguea dentro de fetchInstagramComments/fetchFacebookComments.
      console.log(
        `[comments-sync] provider.fetchComments devolvió ${comments.length} item(s) para external_id=${content.external_id}:`,
        JSON.stringify(comments, null, 2)
      );
      synced += await syncCommentsForContent(supabase, content.id, comments, providerAccount.externalId);
    } catch (err) {
      console.error(`[comments-sync] No se pudieron sincronizar comentarios de content ${content.id}:`, err);
    }
  }

  // Clasificación por reglas (sentimiento + intent_score) de lo que quedó
  // sin clasificar — solo CPU, sin red, cabe sobrado en el timeout.
  await classifyPendingComments(supabase);

  return synced;
}

/**
 * Clasifica (sentimiento + intent_score, ver `comment-classify.ts`) los
 * comentarios que todavía no tienen `classified_at`. No incluye nuestras
 * propias respuestas (is_business_reply=true). No fatal por fila.
 */
async function classifyPendingComments(supabase: DB, limit = 500): Promise<number> {
  const { data: pending, error } = await supabase
    .from("comments")
    .select("id, text")
    .eq("is_business_reply", false)
    .is("classified_at", null)
    .limit(limit);

  if (error) {
    console.error("[comments-sync] Error consultando comentarios sin clasificar:", error);
    return 0;
  }
  if (!pending || pending.length === 0) return 0;

  let classified = 0;
  for (const row of pending) {
    const { sentiment, score } = classifyComment(row.text);
    const { error: updateError } = await supabase
      .from("comments")
      .update({ sentiment, intent_score: score, classified_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) {
      console.error(`[comments-sync] No se pudo clasificar comentario ${row.id}:`, updateError);
      continue;
    }
    classified++;
  }
  return classified;
}

/**
 * Guarda los comentarios de una pieza. Primero los de nivel superior
 * (para tener su id de BD a mano), después las respuestas enlazadas por
 * `parent_comment_id`.
 *
 * `is_business_reply` SÍ se recalcula en cada upsert: a diferencia de
 * `replied`, es derivable de algo que Meta nos devuelve (el autor del
 * comentario es la propia cuenta, `authorPlatformId === accountExternalId`)
 * — así una respuesta hecha en la app de Facebook/Instagram (no desde
 * este dashboard) también queda marcada como nuestra, en vez de colarse
 * como si fuera un comentario más de un cliente.
 *
 * `replied` del comentario padre NO se upsertea en bloque (eso sí seguiría
 * siendo pisar estado local sin necesidad) — cuando una respuesta resulta
 * ser del negocio, se hace un UPDATE puntual sobre el padre. Nunca lo
 * vuelve a false: si ya estaba respondido (por acá o por Meta), sigue así.
 */
async function syncCommentsForContent(
  supabase: DB,
  contentId: string,
  comments: ProviderComment[],
  accountExternalId: string
): Promise<number> {
  if (comments.length === 0) return 0;

  const topLevel = comments.filter((c) => !c.parentExternalId);
  const replies = comments.filter((c) => c.parentExternalId);
  const idByExternalId = new Map<string, string>();
  let synced = 0;

  console.log(
    `[comments-sync] syncCommentsForContent content_id=${contentId} top_level=${topLevel.length} replies=${replies.length}`
  );

  for (const c of topLevel) {
    const isBusinessReply = !!c.authorPlatformId && c.authorPlatformId === accountExternalId;
    const payload = {
      content_id: contentId,
      platform_comment_id: c.externalId,
      author_name: c.authorName ?? null,
      author_platform_id: c.authorPlatformId ?? null,
      text: c.text,
      like_count: c.likeCount ?? null,
      commented_at: c.commentedAt ?? null,
      is_business_reply: isBusinessReply,
    };
    // Diagnóstico (4): si el upsert falla (constraint, tipo de dato,
    // content_id que no resuelve, etc.), esto lo muestra con el payload
    // completo que se intentó guardar.
    const { data, error } = await supabase
      .from("comments")
      .upsert(payload, { onConflict: "content_id,platform_comment_id" })
      .select("id")
      .single();

    if (error || !data) {
      console.error(`[comments-sync] No se pudo guardar comentario ${c.externalId}. Payload:`, payload, "Error:", error);
      continue;
    }
    idByExternalId.set(c.externalId, data.id);
    synced++;
  }

  for (const r of replies) {
    const isBusinessReply = !!r.authorPlatformId && r.authorPlatformId === accountExternalId;
    const parentId = r.parentExternalId ? idByExternalId.get(r.parentExternalId) : undefined;
    const { error } = await supabase.from("comments").upsert(
      {
        content_id: contentId,
        platform_comment_id: r.externalId,
        parent_comment_id: parentId ?? null,
        author_name: r.authorName ?? null,
        author_platform_id: r.authorPlatformId ?? null,
        text: r.text,
        like_count: r.likeCount ?? null,
        commented_at: r.commentedAt ?? null,
        is_business_reply: isBusinessReply,
      },
      { onConflict: "content_id,platform_comment_id" }
    );
    if (error) {
      console.error(`No se pudo guardar respuesta ${r.externalId}:`, error);
      continue;
    }
    synced++;

    // Respuesta propia detectada en el sync (hecha en la app de Meta, no
    // desde acá): marca al padre como respondido igual que haría
    // replyToComment. Busca por platform_comment_id en vez de usar
    // idByExternalId porque el padre puede venir de una corrida anterior
    // (no estar en este mismo batch de `topLevel`).
    if (isBusinessReply && r.parentExternalId) {
      const { error: parentError } = await supabase
        .from("comments")
        .update({ replied: true })
        .eq("content_id", contentId)
        .eq("platform_comment_id", r.parentExternalId);
      if (parentError) {
        console.error(
          `[comments-sync] No se pudo marcar como respondido el comentario padre ${r.parentExternalId}:`,
          parentError
        );
      }
    }
  }

  return synced;
}

/**
 * Resuelve una cuenta activa (provider + token, con refresh si hace
 * falta) y sincroniza sus comentarios recientes. Es el mismo camino que
 * usa `/api/sync?scope=comments` para una cuenta — se comparte para que
 * el botón "Actualizar ahora" de /comments (`comment-actions.ts`) no
 * duplique la resolución de provider/token.
 */
export async function syncAccountComments(supabase: DB, accountId: string): Promise<number> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .eq("status", "active")
    .maybeSingle();

  if (accountError || !account) {
    throw new Error(`Cuenta ${accountId} no encontrada o inactiva.`);
  }

  const provider = getProvider(account.platform);
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
    },
    account.id
  );

  return syncCommentsForAccount(supabase, provider, providerAccount, account.id);
}
