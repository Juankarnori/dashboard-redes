import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import type { PlatformProvider, ProviderAccount, ProviderComment } from "@/lib/platforms/types";

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
      synced += await syncCommentsForContent(supabase, content.id, comments);
    } catch (err) {
      console.error(`[comments-sync] No se pudieron sincronizar comentarios de content ${content.id}:`, err);
    }
  }
  return synced;
}

/**
 * Guarda los comentarios de una pieza. Primero los de nivel superior
 * (para tener su id de BD a mano), después las respuestas enlazadas por
 * `parent_comment_id`. El upsert no incluye `replied`/`is_business_reply`
 * a propósito — son estado local nuestro, no algo que Meta nos devuelva,
 * así que no se pisan en corridas posteriores.
 */
async function syncCommentsForContent(
  supabase: DB,
  contentId: string,
  comments: ProviderComment[]
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
    const payload = {
      content_id: contentId,
      platform_comment_id: c.externalId,
      author_name: c.authorName ?? null,
      author_platform_id: c.authorPlatformId ?? null,
      text: c.text,
      like_count: c.likeCount ?? null,
      commented_at: c.commentedAt ?? null,
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
      },
      { onConflict: "content_id,platform_comment_id" }
    );
    if (error) {
      console.error(`No se pudo guardar respuesta ${r.externalId}:`, error);
      continue;
    }
    synced++;
  }

  return synced;
}
