import type { PlatformProvider, ProviderAccount, ProviderAudienceSnapshot, ProviderComment, ProviderContentItem } from "./types";
import {
  getInstagramProfile,
  getInstagramMedia,
  getInstagramMediaInsights,
  getInstagramAccountInsights,
  getInstagramMediaComments,
  postInstagramCommentReply,
} from "@/lib/social/instagram";

/**
 * Instagram vía Composio, con la misma forma que instagramProvider
 * (lib/platforms/instagram.ts) para que /api/sync no note la
 * diferencia — ver composio-adapter.ts (Fase 2) para cómo se elige uno
 * u otro por cuenta.
 *
 * Fase 3: fetchComments y postCommentReply verificados en vivo contra
 * comentarios reales (creados y borrados como parte de la
 * verificación, no quedaron rastros). publishContent/checkPublishStatus
 * quedan sin implementar todavía en este archivo — el merge de
 * composio-adapter.ts cae al provider directo para esos hasta que
 * lleguen en el siguiente commit de esta misma fase.
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

  async postCommentReply(commentExternalId: string, message: string, account: ProviderAccount): Promise<string> {
    const { userId, connectedAccountId } = requireComposio(account);
    return postInstagramCommentReply(userId, connectedAccountId, commentExternalId, message);
  },
};
