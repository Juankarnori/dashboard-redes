import { getComposioClient } from "./client";
import type { ProviderContentItem, ProviderComment, CommentActivityItem } from "@/lib/platforms/types";

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

/**
 * Trae TODOS los comentarios de una pieza (nivel superior + respuestas)
 * en un solo llamado — verificado en vivo: pedir `parent_id` en el
 * listado plano de INSTAGRAM_GET_IG_MEDIA_COMMENTS ya devuelve las
 * respuestas mezcladas con `parent_id` seteado, sin hacer falta un
 * segundo llamado a INSTAGRAM_GET_IG_COMMENT_REPLIES por comentario
 * (que sería 1 llamado extra por cada comentario con respuestas).
 */
export async function getInstagramMediaComments(
  userId: string,
  connectedAccountId: string,
  mediaId: string
): Promise<ProviderComment[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_IG_MEDIA_COMMENTS", {
    userId,
    connectedAccountId,
    arguments: { ig_media_id: mediaId, fields: "id,text,username,timestamp,like_count,from,parent_id", limit: 100 },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_IG_MEDIA_COMMENTS falló");

  const items = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
  return items.map((c) => {
    const from = c.from as { id?: string } | undefined;
    return {
      externalId: String(c.id),
      parentExternalId: (c.parent_id as string) || undefined,
      authorName: (c.username as string) ?? undefined,
      authorPlatformId: from?.id ?? undefined,
      text: (c.text as string) ?? "",
      likeCount: (c.like_count as number) ?? undefined,
      commentedAt: (c.timestamp as string) ?? undefined,
    };
  });
}

const ACTIVITY_PAGE_SIZE = 100;
const ACTIVITY_MAX_PAGES = 3;

/**
 * Actividad de comentarios de todos los medios desde `sinceIso` — 1 llamada por cada
 * 100 medios (no una por medio). Instagram no tiene updated_time: la señal es `comments_count`,
 * que verificado en vivo INCLUYE las respuestas (un medio con 1 comentario + 2 respuestas
 * reporta 3), así que un comentario nuevo o una respuesta de un cliente cambian el conteo.
 * El sync lo compara contra el último conteo revisado (content.meta.comments_count_checked).
 * Se pagina con el cursor `after` mientras haya `paging.next` y no se haya pasado de `since`.
 */
export async function getInstagramMediaActivity(
  userId: string,
  connectedAccountId: string,
  sinceIso: string
): Promise<CommentActivityItem[]> {
  const composio = getComposioClient();
  const sinceMs = new Date(sinceIso).getTime() - 60_000; // margen por si since es exclusivo
  const out = new Map<string, CommentActivityItem>();
  let after: string | undefined;

  for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
    const args: Record<string, unknown> = {
      ig_user_id: "me",
      limit: ACTIVITY_PAGE_SIZE,
      fields: "id,timestamp,comments_count",
    };
    if (after) args.after = after;

    const result = await composio.tools.execute("INSTAGRAM_GET_IG_USER_MEDIA", {
      userId,
      connectedAccountId,
      arguments: args,
    });
    if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_IG_USER_MEDIA (actividad) falló");

    const items = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
    let reachedSince = false;
    for (const m of items) {
      out.set(String(m.id), {
        externalId: String(m.id),
        commentCount: typeof m.comments_count === "number" ? m.comments_count : undefined,
      });
      const ts = new Date(m.timestamp as string).getTime();
      if (!Number.isNaN(ts) && ts <= sinceMs) reachedSince = true;
    }

    const paging = result.data.paging as { next?: string; cursors?: { after?: string } } | undefined;
    after = paging?.cursors?.after;
    if (items.length === 0 || reachedSince || !paging?.next || !after) break;
  }

  return Array.from(out.values());
}

/**
 * Límites reales de INSTAGRAM_POST_IG_COMMENT_REPLIES (verificados
 * contra el schema del tool, no inventados): 300 caracteres, máx. 4
 * hashtags, máx. 1 URL, no puede ser todo mayúsculas. Se valida acá
 * para dar un error claro en la UI en vez de que Composio lo rebote con
 * un 400 genérico.
 */
export function validateInstagramReply(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Escribí una respuesta.");
  if (trimmed.length > 300) {
    throw new Error(`Instagram permite hasta 300 caracteres en una respuesta (esta tiene ${trimmed.length}).`);
  }
  const hashtags = trimmed.match(/#\w+/g) ?? [];
  if (hashtags.length > 4) {
    throw new Error(`Instagram permite hasta 4 hashtags por respuesta (esta tiene ${hashtags.length}).`);
  }
  const urls = trimmed.match(/https?:\/\/\S+/g) ?? [];
  if (urls.length > 1) {
    throw new Error(`Instagram permite hasta 1 URL por respuesta (esta tiene ${urls.length}).`);
  }
  if (/[A-Z]/.test(trimmed) && !/[a-z]/.test(trimmed)) {
    throw new Error("Instagram no permite respuestas que sean todo en mayúsculas.");
  }
  return trimmed;
}

/** Responde un comentario. Devuelve el id del comentario de respuesta creado. */
export async function postInstagramCommentReply(
  userId: string,
  connectedAccountId: string,
  commentId: string,
  message: string
): Promise<string> {
  const validated = validateInstagramReply(message);
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_POST_IG_COMMENT_REPLIES", {
    userId,
    connectedAccountId,
    arguments: { ig_comment_id: commentId, message: validated },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_POST_IG_COMMENT_REPLIES falló");

  const data = result.data as { id: string };
  return data.id;
}

export interface CreateContainerInput {
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: "REELS" | "CAROUSEL" | "STORIES";
  caption?: string;
  isCarouselItem?: boolean;
}

/** Crea un container (imagen/reel/hijo de carrusel) — primer paso del publish en 2 pasos. No publica nada todavía. */
export async function createInstagramContainer(
  userId: string,
  connectedAccountId: string,
  input: CreateContainerInput
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA", {
    userId,
    connectedAccountId,
    arguments: {
      ig_user_id: "me",
      image_url: input.imageUrl,
      video_url: input.videoUrl,
      media_type: input.mediaType,
      caption: input.caption,
      is_carousel_item: input.isCarouselItem,
    },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_POST_IG_USER_MEDIA falló");
  const data = result.data as { id: string };
  return data.id;
}

/** Crea el container padre de un carrusel a partir de containers hijo ya creados (2-10). */
export async function createInstagramCarouselContainer(
  userId: string,
  connectedAccountId: string,
  childContainerIds: string[],
  caption?: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_CREATE_CAROUSEL_CONTAINER", {
    userId,
    connectedAccountId,
    arguments: { ig_user_id: "me", children: childContainerIds, caption },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_CREATE_CAROUSEL_CONTAINER falló");
  const data = result.data as { id: string };
  return data.id;
}

export type PublishAttemptResult =
  | { status: "published"; mediaId: string }
  | { status: "processing" };

/**
 * Intenta publicar un container con `max_wait_seconds: 0` — a
 * diferencia del comportamiento por defecto del tool (esperar hasta
 * 300s internamente, lo que no entra en el timeout de 10s de Vercel
 * Hobby), esto pide un intento inmediato: si el container ya está
 * FINISHED publica de una, si no devuelve el error 9007 documentado
 * por el propio tool ("Setting this to 0 skips all status checks...
 * will fail with error 9007 if the container is still processing").
 * Tratamos cualquier error que mencione 9007 como "sigue procesando",
 * no como una falla real — el llamador (checkPublishStatus) reintenta
 * este mismo método hasta que Meta termine.
 *
 * Nota de verificación: probado en vivo el camino "ya está listo → se
 * publica" (imagen, procesa casi instantáneo). El camino "todavía
 * procesando → error 9007" está implementado tal como lo documenta el
 * propio schema del tool, pero no se forzó en vivo (necesitaría un
 * video real de a Reels lento para procesar) — si el texto exacto del
 * error de Meta no incluyera "9007" de la forma esperada, el efecto
 * sería que el intento se trate como falla real en vez de "seguir
 * esperando" (visible como error claro en la UI, no un fallo silencioso).
 */
export async function attemptPublishInstagramContainer(
  userId: string,
  connectedAccountId: string,
  containerId: string
): Promise<PublishAttemptResult> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH", {
    userId,
    connectedAccountId,
    arguments: { ig_user_id: "me", creation_id: containerId, max_wait_seconds: 0 },
  });

  if (!result.successful) {
    if (result.error?.includes("9007")) return { status: "processing" };
    throw new Error(result.error ?? "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH falló");
  }

  const data = result.data as { id: string };
  return { status: "published", mediaId: data.id };
}

/** Permalink de un media ya publicado. */
export async function getInstagramPermalink(userId: string, connectedAccountId: string, mediaId: string): Promise<string | null> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_IG_MEDIA", {
    userId,
    connectedAccountId,
    arguments: { ig_media_id: mediaId, fields: "permalink" },
  });
  if (!result.successful) return null;
  const data = result.data as { permalink?: string };
  return data.permalink ?? null;
}

export interface PublishingLimit {
  quotaUsage: number | null;
  quotaCap: number | null;
}

/** Cuota de publicación de las últimas 24h — chequear antes de publicar en lote. */
export async function getInstagramPublishingLimit(userId: string, connectedAccountId: string): Promise<PublishingLimit> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT", {
    userId,
    connectedAccountId,
    arguments: { ig_user_id: "me" },
  });
  if (!result.successful) throw new Error(result.error ?? "INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT falló");

  // Verificado en vivo: result.data.data es un array de 1 elemento
  // {quota_usage, config: {quota_total, quota_duration}} — no el shape
  // anidado que hubiera adivinado por el nombre del campo.
  const entry = (result.data.data as { quota_usage?: number; config?: { quota_total?: number } }[] | undefined)?.[0];
  return {
    quotaUsage: entry?.quota_usage ?? null,
    quotaCap: entry?.config?.quota_total ?? null,
  };
}
