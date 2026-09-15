import { getComposioClient } from "./client";
import type { ProviderContentItem } from "@/lib/platforms/types";

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
