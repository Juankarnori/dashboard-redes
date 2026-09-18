import { getComposioClient } from "./client";
import type { ProviderContentItem, ProviderComment, CommentActivityItem } from "@/lib/platforms/types";

/**
 * Facebook (Página) vía Composio — mismo patrón que instagram.ts: userId
 * (composio_user_id) SIEMPRE junto con connectedAccountId (ver la nota
 * grande en instagram.ts sobre ActionExecute_ConnectedAccountEntityIdRequired).
 *
 * A diferencia de Instagram, acá no hay un solo "recurso" identificado
 * por la cuenta conectada: una cuenta de Facebook puede administrar
 * varias Páginas, y todos los tools de Página (detalles/insights/posts)
 * piden un page_id explícito. Por eso getFacebookPages() va primero —
 * el llamador (settings/composio/page.tsx) usa la primera Página que
 * devuelve, que para este negocio es la única que administra.
 */

export interface FacebookPageRef {
  id: string;
  name: string;
  pictureUrl: string | null;
}

export async function getFacebookPages(userId: string, connectedAccountId: string): Promise<FacebookPageRef[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_LIST_MANAGED_PAGES", {
    userId,
    connectedAccountId,
    arguments: { fields: "id,name,picture" },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_LIST_MANAGED_PAGES falló");

  const pages = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
  return pages.map((p) => ({
    id: String(p.id),
    name: (p.name as string) ?? "",
    pictureUrl: ((p.picture as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)
      ?.url as string | undefined ?? null,
  }));
}

export interface FacebookPageProfile {
  id: string;
  name: string | null;
  fanCount: number | null;
  followersCount: number | null;
  profilePictureUrl: string | null;
}

export async function getFacebookPageProfile(
  userId: string,
  connectedAccountId: string,
  pageId: string
): Promise<FacebookPageProfile> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_PAGE_DETAILS", {
    userId,
    connectedAccountId,
    arguments: { page_id: pageId, fields: "id,name,fan_count,followers_count,picture" },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_GET_PAGE_DETAILS falló");

  const data = result.data as Record<string, unknown>;
  const picture = (data.picture as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  return {
    id: String(data.id ?? pageId),
    name: (data.name as string) ?? null,
    fanCount: typeof data.fan_count === "number" ? data.fan_count : null,
    followersCount: typeof data.followers_count === "number" ? data.followers_count : null,
    profilePictureUrl: (picture?.url as string) ?? null,
  };
}

export interface FacebookPageInsights {
  follows: number | null; // snapshot al día más reciente del rango (no se suma, ver nota abajo)
  postEngagements: number | null;
  mediaViews: number | null;
}

/**
 * page_follows es un total acumulado ("Lifetime") reportado día a día —
 * hay que quedarse con el valor del día más reciente, no sumar la serie
 * (sumar daría un número sin sentido, ~7x el total real). Los otros dos
 * sí son conteos diarios y se suman para el total del período — mismo
 * criterio que Instagram (ver getInstagramAccountInsights).
 */
export async function getFacebookPageInsights(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  days = 7
): Promise<FacebookPageInsights> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_PAGE_INSIGHTS", {
    userId,
    connectedAccountId,
    arguments: {
      page_id: pageId,
      period: "day",
      since: `-${days} days`,
      until: "now",
      metrics: "page_follows,page_post_engagements,page_media_view",
    },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_GET_PAGE_INSIGHTS falló");

  const byMetric = new Map<string, { name: string; values?: { value: number }[] }>();
  const dataPoints = (result.data.data as { name: string; values?: { value: number }[] }[] | undefined) ?? [];
  for (const point of dataPoints) byMetric.set(point.name, point);

  const lastValue = (name: string) => {
    const values = byMetric.get(name)?.values ?? [];
    return values.length > 0 ? values[values.length - 1].value : null;
  };
  const sumValues = (name: string) => {
    const values = byMetric.get(name)?.values;
    return values ? values.reduce((acc, v) => acc + (v.value ?? 0), 0) : null;
  };

  return {
    follows: lastValue("page_follows"),
    postEngagements: sumValues("page_post_engagements"),
    mediaViews: sumValues("page_media_view"),
  };
}

/**
 * Vistas del post (lifetime) — el único metric que Meta todavía expone a
 * nivel de post: `post_impressions_unique`/`post_engaged_users` y el
 * resto de las métricas viejas de post-insights fueron deprecadas por
 * Meta el 15 de noviembre de 2025. Verificado en vivo contra un post
 * real (269 vistas) — pedir cualquier otra métrica falla o vuelve vacío.
 */
export async function getFacebookPostViews(
  userId: string,
  connectedAccountId: string,
  postId: string
): Promise<number | null> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_POST_INSIGHTS", {
    userId,
    connectedAccountId,
    arguments: { post_id: postId, metrics: "post_media_view" },
  });
  if (!result.successful) return null; // posts muy nuevos pueden no tener insights todavía — no es un error fatal

  const point = (result.data.data as { values?: { value: number }[] }[] | undefined)?.[0];
  return point?.values?.[0]?.value ?? null;
}

export async function getFacebookPagePosts(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  limit = 12
): Promise<ProviderContentItem[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_PAGE_POSTS", {
    userId,
    connectedAccountId,
    arguments: {
      page_id: pageId,
      limit,
      fields: "id,message,created_time,permalink_url,full_picture,reactions.summary(true),comments.summary(true)",
    },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_GET_PAGE_POSTS falló");

  const posts = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
  return posts.map((p) => {
    const reactions = p.reactions as { summary?: { total_count?: number } } | undefined;
    const comments = p.comments as { summary?: { total_count?: number } } | undefined;
    return {
      externalId: String(p.id),
      type: "post",
      caption: (p.message as string) ?? undefined,
      thumbnailUrl: (p.full_picture as string) ?? undefined,
      permalink: (p.permalink_url as string) ?? undefined,
      publishedAt: (p.created_time as string) ?? undefined,
      metrics: {
        likes: reactions?.summary?.total_count,
        comments: comments?.summary?.total_count,
      },
    };
  });
}

const ACTIVITY_PAGE_SIZE = 100;
const ACTIVITY_MAX_PAGES = 3;

/**
 * Actividad de comentarios de TODAS las publicaciones de la Página desde
 * `sinceIso`, en 1 llamada por cada 100 posts (no una por post). Verificado
 * en vivo: `updated_time` del feed se mueve cuando entra un comentario o una
 * respuesta (un Reel de oct-2025 con comentario en sep-2026 mostraba
 * updated_time = la fecha del comentario) y `comments.summary(true)` trae el
 * total de nivel superior en el mismo listado.
 *
 * GET_PAGE_POSTS no expone cursor: se pagina con `until` = created_time del
 * post más viejo de la página anterior. Se sigue mientras la página traiga
 * algo y no se haya llegado a `since` (no se corta por "menos de 100":
 * Graph puede devolver páginas cortas con más resultados atrás).
 */
export async function getFacebookCommentActivity(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  sinceIso: string
): Promise<CommentActivityItem[]> {
  const composio = getComposioClient();
  // -60s: margen por si `since` es exclusivo — el post más viejo del rango no puede quedar afuera.
  const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000) - 60;
  const out = new Map<string, CommentActivityItem>();
  let untilSec: number | undefined;

  for (let page = 0; page < ACTIVITY_MAX_PAGES; page++) {
    const args: Record<string, unknown> = {
      page_id: pageId,
      limit: ACTIVITY_PAGE_SIZE,
      since: String(sinceSec),
      fields: "id,created_time,updated_time,comments.summary(true)",
    };
    if (untilSec !== undefined) args.until = String(untilSec);

    const result = await composio.tools.execute("FACEBOOK_GET_PAGE_POSTS", {
      userId,
      connectedAccountId,
      arguments: args,
    });
    if (!result.successful) throw new Error(result.error ?? "FACEBOOK_GET_PAGE_POSTS (actividad) falló");

    const items = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
    if (items.length === 0) break;

    let oldestSec = Infinity;
    for (const p of items) {
      const summary = (p.comments as { summary?: { total_count?: number } } | undefined)?.summary;
      out.set(String(p.id), {
        externalId: String(p.id),
        updatedAt: (p.updated_time as string) ?? undefined,
        commentCount: summary?.total_count,
      });
      const createdSec = Math.floor(new Date(p.created_time as string).getTime() / 1000);
      if (!Number.isNaN(createdSec)) oldestSec = Math.min(oldestSec, createdSec);
    }
    if (oldestSec === Infinity || oldestSec <= sinceSec) break;
    untilSec = oldestSec - 1;
  }

  return Array.from(out.values());
}

/**
 * El id de comentario/respuesta que devuelve Facebook es compuesto
 * (`<algo>_<idNumérico>`) — pero el prefijo NO es estable: el mismo
 * comentario aparece como `postId_commentId` si se lo trae de la lista
 * plana del post, y como `parentCommentId_replyId` si se lo trae
 * anidado bajo su padre (verificado en vivo, ambos casos reales). Lo
 * único estable es el segmento final después del último "_": ese es el
 * id numérico simple que hay que usar como `object_id` al responder —
 * mandar el compuesto tal cual falla con "page not found" porque
 * Composio interpreta el prefijo como un page id (gotcha real,
 * confirmado en vivo antes de este commit).
 */
function extractFacebookCommentId(id: string): string {
  const idx = id.lastIndexOf("_");
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Comentarios de un post (o respuestas de un comentario) — un solo
 * llamado con expansión anidada `comments{...}` trae también las
 * respuestas, igual que la integración directa (ver
 * lib/meta/facebook.ts, fetchFacebookComments) — evita 1 llamado extra
 * por comentario con respuestas.
 */
export async function getFacebookComments(
  userId: string,
  connectedAccountId: string,
  objectId: string
): Promise<ProviderComment[]> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_COMMENTS", {
    userId,
    connectedAccountId,
    arguments: {
      object_id: objectId,
      fields: "id,message,created_time,from,like_count,comments{id,message,created_time,from,like_count}",
    },
  });
  if (!result.successful) return []; // posts sin comentarios habilitados, etc. — no fatal, ver el directo

  const flat: ProviderComment[] = [];
  const topLevel = (result.data.data as Record<string, unknown>[] | undefined) ?? [];
  for (const c of topLevel) {
    const from = c.from as { id?: string; name?: string } | undefined;
    flat.push({
      externalId: String(c.id),
      authorName: from?.name,
      authorPlatformId: from?.id,
      text: (c.message as string) ?? "",
      likeCount: c.like_count as number | undefined,
      commentedAt: c.created_time as string | undefined,
    });
    const replies = (c.comments as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
    for (const r of replies) {
      const rFrom = r.from as { id?: string; name?: string } | undefined;
      flat.push({
        externalId: String(r.id),
        parentExternalId: String(c.id),
        authorName: rFrom?.name,
        authorPlatformId: rFrom?.id,
        text: (r.message as string) ?? "",
        likeCount: r.like_count as number | undefined,
        commentedAt: r.created_time as string | undefined,
      });
    }
  }
  return flat;
}

/** Responde un comentario. Devuelve el id (compuesto) de la respuesta creada. */
export async function postFacebookCommentReply(
  userId: string,
  connectedAccountId: string,
  commentId: string,
  message: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_CREATE_COMMENT", {
    userId,
    connectedAccountId,
    arguments: { object_id: extractFacebookCommentId(commentId), message },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_CREATE_COMMENT falló");

  const data = result.data as { id: string };
  return data.id;
}

/**
 * Los tools de publicar NO son consistentes entre sí sobre qué forma de
 * id devuelven (verificado en vivo, no asumido): FACEBOOK_CREATE_POST
 * devuelve el compuesto `pageId_postId` directo, pero
 * FACEBOOK_CREATE_PHOTO_POST devuelve solo el numérico simple pese a
 * que su propia descripción dice lo contrario ("Returns a composite
 * post_id") — FACEBOOK_GET_POST rechaza el numérico simple con un 400
 * explícito. Esto normaliza cualquiera de los dos a compuesto.
 */
function toCompoundPostId(pageId: string, id: string): string {
  return id.includes("_") ? id : `${pageId}_${id}`;
}

/** Permalink de un post ya publicado. */
export async function getFacebookPostPermalink(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  postId: string
): Promise<string | null> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_GET_POST", {
    userId,
    connectedAccountId,
    arguments: { post_id: toCompoundPostId(pageId, postId) },
  });
  if (!result.successful) return null;
  const data = result.data as { permalink_url?: string };
  return data.permalink_url ?? null;
}

/** Post de solo texto/enlace. */
export async function createFacebookPost(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  message: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_CREATE_POST", {
    userId,
    connectedAccountId,
    arguments: { page_id: pageId, message },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_CREATE_POST falló");
  const data = result.data as { id: string };
  return toCompoundPostId(pageId, data.id);
}

/** Post de una sola foto. */
export async function createFacebookPhotoPost(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  imageUrl: string,
  caption: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_CREATE_PHOTO_POST", {
    userId,
    connectedAccountId,
    arguments: { page_id: pageId, url: imageUrl, message: caption },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_CREATE_PHOTO_POST falló");
  const data = result.data as { id: string };
  return toCompoundPostId(pageId, data.id);
}

/** Post de un solo video. */
export async function createFacebookVideoPost(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  videoUrl: string,
  caption: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_CREATE_VIDEO_POST", {
    userId,
    connectedAccountId,
    arguments: { page_id: pageId, file_url: videoUrl, description: caption },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_CREATE_VIDEO_POST falló");
  const data = result.data as { id: string };
  return toCompoundPostId(pageId, data.id);
}

/**
 * Post multi-foto (carrusel). ⚠️ A diferencia de CREATE_PHOTO_POST, este
 * tool no tiene parámetro `published` — según su propia descripción
 * "publishes immediately" siempre. No se pudo verificar en vivo sin
 * publicar de verdad (a diferencia del resto de esta fase, que sí se
 * probó con published:false o se limpió después) — implementado tal
 * como lo documenta el schema, sin ejercitarlo en vivo.
 */
export async function createFacebookMultiPhotoPost(
  userId: string,
  connectedAccountId: string,
  pageId: string,
  imageUrls: string[],
  caption: string
): Promise<string> {
  const composio = getComposioClient();
  const result = await composio.tools.execute("FACEBOOK_CREATE_MULTI_PHOTO_POST", {
    userId,
    connectedAccountId,
    arguments: { page_id: pageId, photo_urls: imageUrls, message: caption },
  });
  if (!result.successful) throw new Error(result.error ?? "FACEBOOK_CREATE_MULTI_PHOTO_POST falló");
  const data = result.data as { id: string };
  return toCompoundPostId(pageId, data.id);
}
