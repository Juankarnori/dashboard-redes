import { getComposioClient } from "./client";
import type { ProviderContentItem } from "@/lib/platforms/types";

/**
 * Instagram vía Composio — Fase 1 (proof of concept, solo lectura).
 * Mismo shape de salida que `lib/platforms/types.ts` (ProviderContentItem)
 * para que, cuando esto reemplace al camino directo en la Fase 3, el
 * resto de la app (analytics, /api/sync) no tenga que cambiar.
 *
 * Slugs verificados en vivo contra el catálogo real de Composio (no
 * inventados) — ver notas de la Fase 1. La versión del toolkit está
 * pinneada en client.ts (`toolkitVersions`), así que estos execute NO
 * llevan `dangerouslySkipVersionCheck`.
 *
 * `userId` (el mismo que se usó al conectar la cuenta — ver
 * composio_connections.composio_user_id) va SIEMPRE junto con
 * connectedAccountId: encontrado en vivo probando contra datos reales —
 * sin userId, Composio devuelve 400
 * ActionExecute_ConnectedAccountEntityIdRequired ("User ID is required
 * with connected account") aunque connectedAccountId ya identifique la
 * cuenta sin ambigüedad. No estaba documentado así en los ejemplos del
 * SDK que se leyeron para el commit anterior.
 */

export interface SocialProfile {
  id: string;
  username: string | null;
  name: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
}

export async function getInstagramProfile(userId: string, connectedAccountId: string): Promise<SocialProfile> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_USER_INFO", {
    userId,
    connectedAccountId,
    arguments: { ig_user_id: "me" },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_USER_INFO falló");

  const data = result.data as Record<string, unknown>;
  return {
    id: String(data.id ?? data.user_id ?? ""),
    username: (data.username as string) ?? null,
    name: (data.name as string) ?? null,
    followersCount: typeof data.followers_count === "number" ? data.followers_count : null,
    followsCount: typeof data.follows_count === "number" ? data.follows_count : null,
    mediaCount: typeof data.media_count === "number" ? data.media_count : null,
    profilePictureUrl: (data.profile_picture_url as string) ?? null,
  };
}

export interface AccountInsights {
  reach: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
}

const ACCOUNT_METRICS = ["reach", "accounts_engaged", "total_interactions"] as const;

/**
 * Insights de cuenta de los últimos `days` días.
 *
 * Bug real detectado en vivo (Fase 1): pedir period "day" sin metric_type
 * devuelve una serie de datapoints diarios que NO se pueden sumar para
 * "el alcance de la semana" — una misma cuenta que vuelve varios días se
 * cuenta una vez por día, así que la suma infla el número (con datos
 * reales: sumar dio 131, el total único real es 123). metric_type
 * "total_value" le pide a Meta el total ya deduplicado del período,
 * confirmado contra la cuenta real.
 *
 * follower_count se sacó de la lista de métricas: no soporta
 * total_value+period=day (Meta lo omite en silencio, no es un error) y
 * de todos modos no se usaba — el "Seguidores" de la UI sale de
 * getInstagramProfile, no de acá.
 */
export async function getInstagramAccountInsights(
  userId: string,
  connectedAccountId: string,
  days = 7
): Promise<AccountInsights> {
  const composio = getComposioClient();
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86_400;

  const result = await composio.tools.execute("INSTAGRAM_GET_USER_INSIGHTS", {
    userId,
    connectedAccountId,
    arguments: {
      ig_user_id: "me",
      metric: [...ACCOUNT_METRICS],
      period: "day",
      metric_type: "total_value",
      since,
      until,
    },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_USER_INSIGHTS falló");

  const byMetric = new Map<string, number>();
  const dataPoints = (result.data.data as { name: string; total_value?: { value: number } }[] | undefined) ?? [];
  for (const point of dataPoints) {
    if (point.total_value) byMetric.set(point.name, point.total_value.value);
  }

  return {
    reach: byMetric.get("reach") ?? null,
    accountsEngaged: byMetric.get("accounts_engaged") ?? null,
    totalInteractions: byMetric.get("total_interactions") ?? null,
  };
}

function mapMediaType(mediaType?: string, mediaProductType?: string): ProviderContentItem["type"] {
  if (mediaProductType === "STORY") return "story";
  if (mediaProductType === "REELS") return "reel";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  if (mediaType === "VIDEO") return "video";
  return "post";
}

/** Página de medios recientes del usuario — sin insights (ver getInstagramMediaInsights aparte, la API no los trae en el mismo llamado). */
export async function getInstagramMedia(
  userId: string,
  connectedAccountId: string,
  limit = 25
): Promise<ProviderContentItem[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_IG_USER_MEDIA", {
    userId,
    connectedAccountId,
    arguments: { ig_user_id: "me", limit },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_IG_USER_MEDIA falló");

  const items = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
  return items.map((m) => ({
    externalId: String(m.id),
    type: mapMediaType(m.media_type as string | undefined, m.media_product_type as string | undefined),
    caption: (m.caption as string) ?? undefined,
    mediaUrl: (m.media_url as string) ?? undefined,
    thumbnailUrl: (m.thumbnail_url as string) ?? (m.media_url as string) ?? undefined,
    permalink: (m.permalink as string) ?? undefined,
    publishedAt: (m.timestamp as string) ?? undefined,
    metrics: {
      likes: (m.total_like_count as number) ?? (m.like_count as number) ?? undefined,
      comments: (m.total_comments_count as number) ?? (m.comments_count as number) ?? undefined,
      saves: (m.saved_count as number) ?? undefined,
      shares: (m.shares_count as number) ?? undefined,
      impressions: (m.total_views_count as number) ?? (m.view_count as number) ?? undefined,
    },
  }));
}

export interface MediaInsights {
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
}

const MEDIA_METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"] as const;

export async function getInstagramMediaInsights(
  userId: string,
  connectedAccountId: string,
  mediaId: string
): Promise<MediaInsights> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_IG_MEDIA_INSIGHTS", {
    userId,
    connectedAccountId,
    arguments: { ig_media_id: mediaId, metric: [...MEDIA_METRICS] },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_IG_MEDIA_INSIGHTS falló");

  const byMetric = new Map<string, number>();
  const dataPoints =
    (result.data.data as
      | { name: string; values?: { value: number }[]; total_value?: { value: number } }[]
      | undefined) ?? [];
  for (const point of dataPoints) {
    const value = point.total_value?.value ?? (point.values ?? []).reduce((acc, v) => acc + (v.value ?? 0), 0);
    byMetric.set(point.name, value);
  }

  return {
    reach: byMetric.get("reach") ?? null,
    views: byMetric.get("views") ?? null,
    likes: byMetric.get("likes") ?? null,
    comments: byMetric.get("comments") ?? null,
    saved: byMetric.get("saved") ?? null,
    shares: byMetric.get("shares") ?? null,
    totalInteractions: byMetric.get("total_interactions") ?? null,
  };
}
