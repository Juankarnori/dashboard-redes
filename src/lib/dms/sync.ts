import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CommentSentiment, DmDirection, DmMediaKind } from "@/types/db";
import type { PlatformProvider, ProviderAccount, ProviderConversation, ProviderMessage } from "@/lib/platforms/types";
import { classifyComment } from "@/lib/analytics/comment-classify";

type DB = SupabaseClient<Database>;

/** Hilos cuyos mensajes se piden a la vez (mismo criterio que COMMENTS_CONCURRENCY). */
const DM_CONCURRENCY = 4;

/**
 * Tope de hilos que se bajan por corrida y por cuenta. Cada hilo cuesta una llamada a
 * Composio; en la práctica lo acota el presupuesto de tiempo de abajo (timeout de 10 s de
 * Vercel Hobby). Lo que no entra queda sin checkpoint y va en la próxima corrida (el
 * backfill inicial de una cuenta con muchos hilos se reparte en varias corridas).
 */
export const DM_MAX_THREADS_PER_RUN = 8;

/**
 * No se arranca un lote nuevo si ya pasaron tantos ms desde el inicio. Medido en vivo: el
 * listado ronda 2,5 s y un lote de 4 hilos (paralelos) ~2,5 s más + las escrituras a la BD,
 * o sea 6-8 s con UN solo lote; por eso en la práctica entra un lote por corrida y el
 * backfill inicial se reparte en varias. El primer lote tiene su propio límite (más holgado)
 * para el caso de que el listado haya sido lento.
 */
export const DM_TIME_BUDGET_MS = 4500;
export const DM_FIRST_BATCH_LIMIT_MS = 5000;

/** Páginas del listado que se recorren como máximo (IG pagina con cursor; FB solo trae la primera). */
const DM_MAX_LIST_PAGES = 3;

/** Mensajes más recientes que se guardan por hilo (el tope de la red es 25). */
const DM_MESSAGES_PER_THREAD = 25;

const LAST_TEXT_MAX_CHARS = 300;

/** ¿Hay que (re)bajar este hilo? Sin fila = hilo nuevo; con fila, solo si la red lo movió después del checkpoint. */
export function threadNeedsSync(listedUpdatedAt: string | undefined, storedCheckpoint: string | null | undefined, hasRow: boolean): boolean {
  if (!hasRow) return true;
  if (!listedUpdatedAt || !storedCheckpoint) return true; // sin señal confiable, mejor revisar
  return new Date(listedUpdatedAt).getTime() > new Date(storedCheckpoint).getTime();
}

export interface DerivedThreadState {
  lastMessageAt: string;
  lastMessageText: string | null;
  lastMessageMedia: DmMediaKind | null;
  lastMessageDirection: DmDirection;
  lastInboundAt: string | null;
  /** true = no queda nada del cliente por responder (ver comentario de `replied` en la migración 0018). */
  replied: boolean;
  sentiment: CommentSentiment | null;
  intentScore: number;
}

/**
 * Estado del hilo a partir de sus mensajes REALES (nunca de estado local): así una respuesta
 * hecha desde la app de Meta también cuenta. `messages` viene del más viejo al más nuevo.
 *
 * Clasificación: el tramo pendiente = mensajes del cliente posteriores a la última respuesta
 * del negocio; si el negocio ya respondió lo último, se clasifica el último mensaje del
 * cliente (el hilo sigue mostrando si era un lead). Los mensajes sin texto no aportan señal.
 */
export function deriveThreadState(messages: ProviderMessage[]): DerivedThreadState | null {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const last = sorted[sorted.length - 1];

  let lastInbound: ProviderMessage | undefined;
  let lastOutboundIdx = -1;
  sorted.forEach((m, i) => {
    if (m.direction === "in") lastInbound = m;
    else lastOutboundIdx = i;
  });

  let tail = sorted.slice(lastOutboundIdx + 1).filter((m) => m.direction === "in");
  if (tail.length === 0 && lastInbound) tail = [lastInbound];
  const tailText = tail.map((m) => m.text.trim()).filter(Boolean).join(" ");

  let sentiment: CommentSentiment | null = null;
  let intentScore = 0;
  if (lastInbound) {
    const result = classifyComment(tailText);
    sentiment = result.sentiment;
    intentScore = result.score;
  }

  return {
    lastMessageAt: last.sentAt,
    lastMessageText: last.text.trim() ? last.text.trim().slice(0, LAST_TEXT_MAX_CHARS) : null,
    lastMessageMedia: last.media ?? null,
    lastMessageDirection: last.direction,
    lastInboundAt: lastInbound ? lastInbound.sentAt : null,
    replied: !lastInbound || last.direction === "out",
    sentiment,
    intentScore,
  };
}

/**
 * Guarda un hilo (fila + mensajes) y estampa el checkpoint. La fila del hilo se escribe SOLO
 * después de bajar los mensajes: "no hay fila" sigue significando "hilo por bajar". Los
 * mensajes se upsertean por (conversation_id, external_id): reprocesar no duplica.
 */
async function saveThread(
  supabase: DB,
  accountId: string,
  conversation: ProviderConversation,
  messages: ProviderMessage[]
): Promise<boolean> {
  const state = deriveThreadState(messages);
  if (!state) return false;

  const { data: row, error } = await supabase
    .from("dm_conversations")
    .upsert(
      {
        account_id: accountId,
        external_id: conversation.externalId,
        participant_id: conversation.participantId,
        participant_name: conversation.participantName ?? null,
        network_updated_at: conversation.updatedAt ?? state.lastMessageAt,
        last_message_at: state.lastMessageAt,
        last_message_text: state.lastMessageText,
        last_message_media: state.lastMessageMedia,
        last_message_direction: state.lastMessageDirection,
        last_inbound_at: state.lastInboundAt,
        can_reply: conversation.canReply ?? null,
        unread_count: conversation.unreadCount ?? null,
        link: conversation.link ?? null,
        replied: state.replied,
        sentiment: state.sentiment,
        intent_score: state.intentScore,
        classified_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "account_id,external_id" }
    )
    .select("id")
    .single();

  if (error || !row) {
    console.error(`[dms-sync] no se pudo guardar el hilo ${conversation.externalId}:`, error?.message);
    return false;
  }

  const { error: messagesError } = await supabase.from("dm_messages").upsert(
    messages.map((m) => ({
      conversation_id: row.id,
      external_id: m.externalId,
      direction: m.direction,
      author_id: m.authorId ?? null,
      body: m.text,
      media_kind: m.media ?? null,
      sent_at: m.sentAt,
    })),
    { onConflict: "conversation_id,external_id" }
  );
  if (messagesError) {
    // La fila del hilo ya quedó con el checkpoint nuevo: sin esto los mensajes no se
    // reintentarían. Se baja el checkpoint a null para que el próximo sync vuelva a intentarlo.
    console.error(`[dms-sync] no se pudieron guardar los mensajes del hilo ${conversation.externalId}:`, messagesError.message);
    await supabase.from("dm_conversations").update({ network_updated_at: null }).eq("id", row.id);
    return false;
  }
  return true;
}

/**
 * Sincroniza los hilos de mensajes directos de una cuenta. No fatal por hilo. Devuelve la
 * cantidad de hilos guardados. NUNCA loguea texto de mensajes ni nombres: solo conteos.
 *
 * Costo en régimen normal: UNA llamada de listado por corrida (los hilos sin novedades no
 * se vuelven a pedir gracias al checkpoint `network_updated_at`) + una por hilo con novedad.
 */
export async function syncDmsForAccount(
  supabase: DB,
  provider: PlatformProvider,
  providerAccount: ProviderAccount,
  accountId: string
): Promise<number> {
  if (!provider.fetchConversations || !provider.fetchMessages) return 0;

  const startedMs = Date.now();

  // 1) Listado (más reciente primero) hasta juntar suficientes hilos por bajar.
  const listed: ProviderConversation[] = [];
  const toSync: ProviderConversation[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < DM_MAX_LIST_PAGES; page++) {
    const result = await provider.fetchConversations(providerAccount, cursor ? { after: cursor } : undefined);
    if (result.conversations.length === 0) break;
    listed.push(...result.conversations);

    const { data: existing, error } = await supabase
      .from("dm_conversations")
      .select("external_id, network_updated_at")
      .eq("account_id", accountId)
      .in("external_id", result.conversations.map((c) => c.externalId));
    if (error) throw new Error(`No se pudo leer el checkpoint de mensajes: ${error.message}`);
    const checkpoints = new Map((existing ?? []).map((r) => [r.external_id, r.network_updated_at]));

    const pageNeeds = result.conversations.filter((c) =>
      threadNeedsSync(c.updatedAt, checkpoints.get(c.externalId), checkpoints.has(c.externalId))
    );
    toSync.push(...pageNeeds);

    // Listado ordenado por recencia: si en esta página ya hay hilos sin novedades, lo que
    // sigue es más viejo y tampoco cambió. Tampoco se sigue si ya hay trabajo de sobra.
    const allNeeded = pageNeeds.length === result.conversations.length;
    if (!allNeeded || toSync.length >= DM_MAX_THREADS_PER_RUN || !result.nextCursor) break;
    cursor = result.nextCursor;
  }

  const batch = toSync
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, DM_MAX_THREADS_PER_RUN);

  // 2) Mensajes de los hilos con novedad, en lotes en paralelo con presupuesto de tiempo.
  let saved = 0;
  for (let i = 0; i < batch.length; i += DM_CONCURRENCY) {
    if (Date.now() - startedMs > (i === 0 ? DM_FIRST_BATCH_LIMIT_MS : DM_TIME_BUDGET_MS)) {
      console.log(`[dms-sync] account=${accountId} presupuesto de tiempo agotado — ${batch.length - i} hilo(s) quedan para la próxima corrida`);
      break;
    }
    await Promise.all(
      batch.slice(i, i + DM_CONCURRENCY).map(async (conversation) => {
        try {
          const messages = await provider.fetchMessages!(conversation.externalId, providerAccount, { limit: DM_MESSAGES_PER_THREAD });
          if (await saveThread(supabase, accountId, conversation, messages)) saved++;
        } catch (err) {
          console.error(
            `[dms-sync] no se pudo sincronizar el hilo ${conversation.externalId}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      })
    );
  }

  console.log(
    `[dms-sync] account=${accountId} listados=${listed.length} con novedad=${toSync.length} guardados=${saved} total_ms=${Date.now() - startedMs}`
  );
  return saved;
}
