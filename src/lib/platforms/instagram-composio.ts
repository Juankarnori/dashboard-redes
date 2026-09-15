import type { PlatformProvider, ProviderAccount, ProviderAudienceSnapshot, ProviderContentItem } from "./types";
import { getInstagramProfile, getInstagramMedia, getInstagramMediaInsights } from "@/lib/social/instagram";

/**
 * Instagram vía Composio, con la misma forma que instagramProvider
 * (lib/platforms/instagram.ts) para que /api/sync no note la
 * diferencia — ver composio-adapter.ts (Fase 2) para cómo se elige uno
 * u otro por cuenta.
 *
 * Solo implementa fetchContent/fetchAudience (lo único que
 * lib/social/instagram.ts sabe hacer hoy): fetchComments,
 * postCommentReply y publishContent quedan sin implementar a propósito
 * — el merge de composio-adapter.ts cae al provider directo para esos
 * hasta que tengan su equivalente Composio (Fase 3).
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
    const profile = await getInstagramProfile(userId, connectedAccountId);
    return {
      followers: profile.followersCount ?? undefined,
      follows: profile.followsCount ?? undefined,
      mediaCount: profile.mediaCount ?? undefined,
    };
  },
};
