import type {
  PlatformProvider,
  ProviderAccount,
  CommentActivityItem,
  ConversationPage,
  ProviderAudienceSnapshot,
  ProviderComment,
  ProviderContentItem,
  ProviderMessage,
  PublishInput,
  PublishResult,
} from "./types";
import {
  getInstagramProfile,
  getInstagramMedia,
  getInstagramMediaInsights,
  getInstagramAccountInsights,
  getInstagramMediaComments,
  getInstagramMediaActivity,
  getInstagramConversations,
  getInstagramMessages,
  postInstagramCommentReply,
  createInstagramContainer,
  createInstagramCarouselContainer,
  attemptPublishInstagramContainer,
  getInstagramPermalink,
} from "@/lib/social/instagram";

const IG_CAROUSEL_MAX_ITEMS = 10;

/**
 * Instagram vía Composio, con la misma forma que instagramProvider
 * (lib/platforms/instagram.ts) para que /api/sync no note la
 * diferencia — ver composio-adapter.ts (Fase 2) para cómo se elige uno
 * u otro por cuenta.
 *
 * Fase 3: fetchComments, postCommentReply, publishContent y
 * checkPublishStatus verificados en vivo contra la cuenta real (un
 * comentario de prueba respondido y borrado; un post de prueba real
 * publicado con max_wait_seconds:0 y borrado a mano desde la app — ver
 * el commit de esta pieza para el detalle). El camino "container
 * todavía procesando" (error 9007) está implementado tal como lo
 * documenta el propio schema de INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH,
 * pero no se forzó en vivo — requeriría un video real lento de
 * procesar; ver la nota en attemptPublishInstagramContainer.
 */
function requireComposio(account: ProviderAccount) {
  if (!account.composio) {
    throw new Error(`Cuenta ${account.id}: instagramComposioProvider requiere account.composio (userId+connectedAccountId).`);
  }
  return account.composio;
}

export const instagramComposioProvider: PlatformProvider = {
  platform: "instagram",

  async fetchContent(account: ProviderAccount): Promise<ProviderContentItem[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    const media = await getInstagramMedia(userId, connectedAccountId, 25);

    // Insights por pieza es un llamado aparte (INSTAGRAM_GET_IG_MEDIA_INSIGHTS
    // no viene incluido en el listado) — igual que el provider directo
    // (fetchMediaInsights por item, ver instagram.ts). Si uno falla (post
    // muy nuevo, tipo de media sin insights, etc.) no tira todo el sync:
    // esa pieza queda con los conteos básicos que ya trae el listado.
    return Promise.all(
      media.map(async (item) => {
        try {
          const insights = await getInstagramMediaInsights(userId, connectedAccountId, item.externalId);
          return {
            ...item,
            metrics: {
              ...item.metrics,
              reach: insights.reach ?? item.metrics.reach,
              impressions: insights.views ?? item.metrics.impressions,
              likes: insights.likes ?? item.metrics.likes,
              comments: insights.comments ?? item.metrics.comments,
              saves: insights.saved ?? item.metrics.saves,
              shares: insights.shares ?? item.metrics.shares,
            },
          };
        } catch (err) {
          console.warn(`IG Composio: no se pudieron traer insights de ${item.externalId}, uso conteos básicos:`, err);
          return item;
        }
      })
    );
  },

  async fetchAudience(account: ProviderAccount): Promise<ProviderAudienceSnapshot> {
    const { userId, connectedAccountId } = requireComposio(account);
    // getInstagramAccountInsights ya pide metric_type=total_value (ver el
    // fix del bug de alcance) — reusarla con days=1 da el punto DE ESE
    // día (para el gráfico de tendencias) y con days=7 da el alcance
    // único ya deduplicado de la semana (para el KPI de Resumen). Son
    // dos llamadas porque son dos preguntas distintas, no una redundancia:
    // el total de 7 días NO es la suma de 7 días individuales (ver
    // reach_7d en la migración 0017).
    const [profile, daily, weekly] = await Promise.all([
      getInstagramProfile(userId, connectedAccountId),
      getInstagramAccountInsights(userId, connectedAccountId, 1),
      getInstagramAccountInsights(userId, connectedAccountId, 7),
    ]);
    return {
      followers: profile.followersCount ?? undefined,
      follows: profile.followsCount ?? undefined,
      mediaCount: profile.mediaCount ?? undefined,
      reachToday: daily.reach ?? undefined,
      interactionsToday: daily.totalInteractions ?? undefined,
      reach7d: weekly.reach ?? undefined,
    };
  },

  async fetchComments(contentExternalId: string, account: ProviderAccount): Promise<ProviderComment[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    return getInstagramMediaComments(userId, connectedAccountId, contentExternalId);
  },

  async fetchCommentActivity(account: ProviderAccount, since: string): Promise<CommentActivityItem[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    return getInstagramMediaActivity(userId, connectedAccountId, since);
  },

  // DMs de Instagram. account.externalId ES el id de la cuenta de IG (el "negocio" en los mensajes).
  async fetchConversations(account: ProviderAccount, opts?: { limit?: number; after?: string }): Promise<ConversationPage> {
    const { userId, connectedAccountId } = requireComposio(account);
    return getInstagramConversations(userId, connectedAccountId, account.externalId, opts);
  },

  async fetchMessages(conversationExternalId: string, account: ProviderAccount, opts?: { limit?: number }): Promise<ProviderMessage[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    return getInstagramMessages(userId, connectedAccountId, account.externalId, conversationExternalId, opts?.limit);
  },

  async postCommentReply(commentExternalId: string, message: string, account: ProviderAccount): Promise<string> {
    const { userId, connectedAccountId } = requireComposio(account);
    return postInstagramCommentReply(userId, connectedAccountId, commentExternalId, message);
  },

  async publishContent(input: PublishInput, account: ProviderAccount): Promise<PublishResult> {
    const { userId, connectedAccountId } = requireComposio(account);
    if (input.media.length === 0) throw new Error("Falta el archivo a publicar.");

    if (input.media.length === 1) {
      const [item] = input.media;
      const containerId = await createInstagramContainer(userId, connectedAccountId, {
        imageUrl: item.type === "image" ? item.url : undefined,
        videoUrl: item.type === "video" ? item.url : undefined,
        mediaType: item.type === "video" ? "REELS" : undefined,
        caption: input.caption,
      });
      return finishOrKeepProcessing(userId, connectedAccountId, containerId);
    }

    // Carrusel: solo imágenes, mismo tope que el provider directo.
    if (input.media.some((m) => m.type !== "image")) {
      throw new Error("El carrusel de Instagram solo acepta imágenes, no video.");
    }
    if (input.media.length > IG_CAROUSEL_MAX_ITEMS) {
      throw new Error(`Instagram acepta hasta ${IG_CAROUSEL_MAX_ITEMS} imágenes por carrusel.`);
    }

    const children = await Promise.all(
      input.media.map((m) => createInstagramContainer(userId, connectedAccountId, { imageUrl: m.url, isCarouselItem: true }))
    );
    const containerId = await createInstagramCarouselContainer(userId, connectedAccountId, children, input.caption);
    return finishOrKeepProcessing(userId, connectedAccountId, containerId);
  },

  async checkPublishStatus(containerId: string, account: ProviderAccount): Promise<PublishResult> {
    const { userId, connectedAccountId } = requireComposio(account);
    return finishOrKeepProcessing(userId, connectedAccountId, containerId);
  },
};

/** Común a publishContent y checkPublishStatus: intenta publicar; si Meta sigue procesando, avisa que sigue en curso. */
async function finishOrKeepProcessing(userId: string, connectedAccountId: string, containerId: string): Promise<PublishResult> {
  const attempt = await attemptPublishInstagramContainer(userId, connectedAccountId, containerId);
  if (attempt.status === "processing") return { kind: "processing", containerId };

  const permalink = await getInstagramPermalink(userId, connectedAccountId, attempt.mediaId);
  return { kind: "published", externalId: attempt.mediaId, permalink: permalink ?? undefined };
}
