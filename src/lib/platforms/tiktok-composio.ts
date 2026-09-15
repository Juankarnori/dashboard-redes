import type { PlatformProvider, ProviderAccount, ProviderAudienceSnapshot, ProviderContentItem } from "./types";
import { getTikTokProfile, getTikTokVideos } from "@/lib/social/tiktok";

/**
 * TikTok vía Composio — mismo patrón que instagram-composio.ts /
 * facebook-composio.ts. A diferencia de esas dos, acá no hace falta un
 * enriquecimiento por-item aparte: TIKTOK_LIST_VIDEOS ya devuelve
 * view/like/comment/share count en el mismo llamado (ver
 * lib/social/tiktok.ts). Igual que la integración directa, TikTok no
 * expone alcance ni guardados con estos scopes — no es una limitación
 * nueva del camino Composio.
 *
 * Publicar sigue bloqueado (ver connections.ts, getOrCreateTikTokAuthConfig):
 * publishContent queda sin implementar, el merge cae al provider
 * directo — que en modo Draft tampoco "publica" de verdad, solo manda
 * al inbox del creador.
 */
function requireComposio(account: ProviderAccount) {
  if (!account.composio) {
    throw new Error(`Cuenta ${account.id}: tiktokComposioProvider requiere account.composio (userId+connectedAccountId).`);
  }
  return account.composio;
}

export const tiktokComposioProvider: PlatformProvider = {
  platform: "tiktok",

  async fetchContent(account: ProviderAccount): Promise<ProviderContentItem[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    return getTikTokVideos(userId, connectedAccountId, 20);
  },

  async fetchAudience(account: ProviderAccount): Promise<ProviderAudienceSnapshot> {
    const { userId, connectedAccountId } = requireComposio(account);
    const profile = await getTikTokProfile(userId, connectedAccountId);
    return {
      followers: profile.followerCount ?? undefined,
      follows: profile.followingCount ?? undefined,
      mediaCount: profile.videoCount ?? undefined,
      demographics: profile.likesCount != null ? { total_likes: profile.likesCount } : {},
    };
  },
};
