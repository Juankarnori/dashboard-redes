import { getComposioClient } from "./client";
import type { ProviderContentItem } from "@/lib/platforms/types";

/**
 * TikTok vía Composio — mismo patrón que instagram.ts/facebook.ts
 * (userId + connectedAccountId siempre juntos). Acotado a los dos tools
 * cuyo scope SÍ está aprobado en la app de TikTok del dueño
 * (TIKTOK_GET_USER_STATS, TIKTOK_LIST_VIDEOS — ver connections.ts,
 * getOrCreateTikTokAuthConfig): nada de publicar por acá todavía.
 */

export interface TikTokProfile {
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  likesCount: number | null;
  videoCount: number | null;
}

export async function getTikTokProfile(userId: string, connectedAccountId: string): Promise<TikTokProfile> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("TIKTOK_GET_USER_STATS", {
    userId,
    connectedAccountId,
    arguments: {
      fields: [
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
        "username",
        "display_name",
        "bio_description",
        "avatar_url",
      ],
    },
    dangerouslySkipVersionCheck: true,
  });
  if (!result.successful) throw new Error(result.error ?? "TIKTOK_GET_USER_STATS falló");

  // Mismo doble anidamiento que TIKTOK_LIST_VIDEOS ({data:{data:{user:{...}}}}):
  // TikTok API ya envuelve su respuesta en {data,error}, y Composio no lo
  // desenvuelve. La primera verificación en vivo de esto (commit
  // anterior) leyó mal su propio log e infirió el anidamiento contrario
  // — vuelto a confirmar leyendo Object.keys() de la respuesta cruda, no
  // solo un JSON.stringify recortado.
  const user = (result.data.data as { user?: Record<string, unknown> } | undefined)?.user ?? {};
  return {
    username: (user.username as string) ?? null,
    displayName: (user.display_name as string) ?? null,
    bio: (user.bio_description as string) ?? null,
    avatarUrl: (user.avatar_url as string) ?? null,
    followerCount: typeof user.follower_count === "number" ? user.follower_count : null,
    followingCount: typeof user.following_count === "number" ? user.following_count : null,
    likesCount: typeof user.likes_count === "number" ? user.likes_count : null,
    videoCount: typeof user.video_count === "number" ? user.video_count : null,
  };
}

export async function getTikTokVideos(
  userId: string,
  connectedAccountId: string,
  limit = 12
): Promise<ProviderContentItem[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("TIKTOK_LIST_VIDEOS", {
    userId,
    connectedAccountId,
    arguments: { max_count: Math.min(limit, 20) }, // 20 es el máximo que acepta el tool por página
    dangerouslySkipVersionCheck: true,
  });
  if (!result.successful) throw new Error(result.error ?? "TIKTOK_LIST_VIDEOS falló");

  // Acá sí hay un nivel extra de anidamiento respecto a
  // TIKTOK_GET_USER_STATS ({data:{data:{videos:[...]}}}) — confirmado en
  // vivo, no documentado en el schema del tool.
  const inner = result.data.data as { videos?: Record<string, unknown>[] } | undefined;
  const videos = inner?.videos ?? [];
  return videos.map((v) => ({
    externalId: String(v.id),
    type: "video",
    caption: (v.video_description as string) || (v.title as string) || undefined,
    thumbnailUrl: (v.cover_image_url as string) ?? undefined,
    permalink: (v.share_url as string) ?? undefined,
    publishedAt:
      typeof v.create_time === "number" ? new Date(v.create_time * 1000).toISOString() : undefined,
    metrics: {
      likes: v.like_count as number | undefined,
      comments: v.comment_count as number | undefined,
      shares: v.share_count as number | undefined,
      impressions: v.view_count as number | undefined,
    },
  }));
}
