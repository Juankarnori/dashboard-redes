import type { PlatformProvider, ProviderAccount, ProviderContentItem, PublishInput, PublishResult, RefreshedToken } from "./types";
import { fetchTikTokUserInfo, fetchTikTokVideos, uploadTikTokVideoToInbox, type TikTokVideo } from "@/lib/tiktok/api";
import { refreshTikTokToken } from "@/lib/tiktok/oauth";

// Refresca si falta menos de esto para vencer (o si ya venció).
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function toContentItem(video: TikTokVideo): ProviderContentItem {
  return {
    externalId: video.id,
    type: "video",
    caption: video.video_description || video.title,
    thumbnailUrl: video.cover_image_url,
    permalink: video.share_url,
    publishedAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
    metrics: {
      // TikTok no expone alcance ni guardados con los scopes actuales
      // (user.info.profile, user.info.stats, video.list).
      impressions: video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
    },
  };
}

export const tiktokProvider: PlatformProvider = {
  platform: "tiktok",

  async fetchContent(account: ProviderAccount) {
    const videos = await fetchTikTokVideos(account.accessToken);
    return videos.map(toContentItem);
  },

  // TikTok no expone un endpoint de "stories" — fetchStories queda sin
  // implementar, igual que Facebook.

  async fetchAudience(account: ProviderAccount) {
    const profile = await fetchTikTokUserInfo(account.accessToken);
    return {
      followers: profile.follower_count,
      follows: profile.following_count,
      mediaCount: profile.video_count,
      demographics: profile.likes_count !== undefined ? { total_likes: profile.likes_count } : {},
    };
  },

  // TikTok Login Kit no da acceso a comentarios de terceros con estos
  // scopes — fetchComments/postCommentReply quedan sin implementar.

  async refreshTokenIfNeeded(account: ProviderAccount): Promise<RefreshedToken | null> {
    const expiresAtMs = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
    const needsRefresh = !account.tokenExpiresAt || expiresAtMs - Date.now() < REFRESH_MARGIN_MS;
    if (!needsRefresh) return null;

    if (!account.refreshToken) {
      throw new Error(
        `Cuenta TikTok ${account.id} necesita refrescar el access_token pero no tiene refresh_token guardado.`
      );
    }

    console.log(
      `[tiktok-refresh] account=${account.id} vencía=${account.tokenExpiresAt ?? "desconocido"} — refrescando token`
    );

    // El refresh_token de TikTok rota en cada uso: el que devuelve esta
    // llamada reemplaza al anterior, que queda invalidado de inmediato.
    const token = await refreshTikTokToken(account.refreshToken);

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    };
  },

  // Modo Draft (video.upload): TikTok no publica nada por sí solo, solo
  // entrega el archivo al inbox del creador — por eso `caption` no se
  // usa acá (el título/descripción se define a mano en la app).
  async publishContent(input: PublishInput, account: ProviderAccount): Promise<PublishResult> {
    if (input.mediaType !== "video") {
      throw new Error("TikTok solo acepta video en este flujo (modo Draft, video.upload).");
    }
    const publishId = await uploadTikTokVideoToInbox(account.accessToken, input.mediaUrl);
    return { kind: "draft_sent", externalId: publishId };
  },
};
