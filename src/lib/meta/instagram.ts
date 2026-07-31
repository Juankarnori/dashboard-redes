import { GRAPH_BASE } from "./oauth";

/**
 * Llamadas a la Instagram Graph API (cuentas Business/Creator vinculadas
 * a una Page de Facebook). El token usado es el Page access token.
 *
 * Graph API v22.0+ (ver GRAPH_VERSION en ./oauth.ts):
 * - 'impressions' y 'video_views' quedaron deprecados — todo tipo de
 *   contenido (posts, reels, historias) reporta ahora un único campo
 *   'views'.
 * - Métricas de media insights disponibles: views, reach, saved, shares,
 *   likes, comments, reposts, reels_skip_rate. `reposts` y
 *   `reels_skip_rate` solo aplican a Reels — pedirlas para un post/story
 *   hace que Meta rechace la llamada completa, así que van en un set de
 *   métricas aparte (REEL_METRICS).
 * - Las métricas de engagement (todo lo anterior) solo están disponibles
 *   para cuentas con 1,000+ seguidores. Por debajo de ese umbral, Meta
 *   devuelve un error en /insights — no es un fallo del sync, es una
 *   limitación documentada de la API. `checkEngagementEligibility` lo
 *   verifica una vez por cuenta (evita pedir insights que sabemos que
 *   van a fallar) y `fetchMediaInsights` igual detecta el caso si se
 *   cuela, para loguear un warning claro en vez de uno genérico.
 *
 * ⚠️ Meta sigue cambiando nombres de métricas entre versiones — si algo
 * empieza a fallar, revisa
 * https://developers.facebook.com/docs/instagram-api/guides/insights
 * y ajusta las constantes de abajo. El fetch de insights está aislado en
 * `fetchMediaInsights` y falla de forma no fatal (devuelve {} y loguea)
 * para no tumbar todo el sync por una métrica renombrada.
 */

export interface IgMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface IgMediaListResponse {
  data: IgMedia[];
  paging?: { next?: string };
}

const POST_METRICS = "views,reach,saved,shares,likes,comments";
const REEL_METRICS = "views,reach,saved,shares,likes,comments,reposts,reels_skip_rate";
const STORY_METRICS = "views,reach,replies,taps_forward,taps_back,exits";

const MIN_FOLLOWERS_FOR_ENGAGEMENT_INSIGHTS = 1000;

/** Posts y reels permanentes (NO incluye historias, que expiran a las 24h). */
export async function fetchInstagramMedia(igUserId: string, token: string): Promise<IgMedia[]> {
  const items: IgMedia[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/${igUserId}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${encodeURIComponent(token)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`IG /media falló: ${res.status} ${await res.text()}`);
    const json: IgMediaListResponse = await res.json();
    items.push(...json.data);
    url = json.paging?.next;
  }
  return items;
}

/** Historias activas (últimas 24h) — hay que llamarlo seguido o se pierden. */
export async function fetchInstagramStories(igUserId: string, token: string): Promise<IgMedia[]> {
  const url = `${GRAPH_BASE}/${igUserId}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IG /stories falló: ${res.status} ${await res.text()}`);
  const json: IgMediaListResponse = await res.json();
  return json.data.map((s) => ({ ...s, media_product_type: "STORY" as const }));
}

export interface EngagementEligibility {
  eligible: boolean;
  followers: number;
}

/**
 * Meta exige 1,000+ seguidores para exponer insights de engagement.
 * Se verifica una vez por cuenta (no por media) para no gastar cuota
 * pidiendo insights que ya sabemos que van a fallar.
 */
export async function checkEngagementEligibility(
  igUserId: string,
  token: string
): Promise<EngagementEligibility> {
  const audience = await fetchInstagramAudience(igUserId, token);
  const followers = audience.followers_count ?? 0;
  return { eligible: followers >= MIN_FOLLOWERS_FOR_ENGAGEMENT_INSIGHTS, followers };
}

function isFollowerThresholdError(body: string): boolean {
  return /1,?000/.test(body) && /follower/i.test(body);
}

/**
 * Insights de un media individual. No fatal: devuelve {} si Meta rechaza
 * las métricas (renombradas, cuenta bajo el umbral de seguidores, etc.).
 * `eligible=false` evita la llamada por completo (ya sabemos que fallará).
 */
export async function fetchMediaInsights(
  mediaId: string,
  productType: IgMedia["media_product_type"],
  token: string,
  eligible = true
): Promise<Record<string, number>> {
  if (!eligible) return {};

  const metrics =
    productType === "REELS" ? REEL_METRICS : productType === "STORY" ? STORY_METRICS : POST_METRICS;

  const url = `${GRAPH_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    if (isFollowerThresholdError(body)) {
      console.warn(
        `IG insights no disponibles para ${mediaId} (${productType}): la cuenta tiene menos de ${MIN_FOLLOWERS_FOR_ENGAGEMENT_INSIGHTS} seguidores — Meta no expone insights de engagement bajo ese umbral. Se guardan solo los conteos básicos del endpoint de media.`
      );
    } else {
      console.warn(`IG insights no disponibles para ${mediaId} (${productType}): ${body}`);
    }
    return {};
  }
  const json: { data: { name: string; values: { value: number }[] }[] } = await res.json();
  const result: Record<string, number> = {};
  for (const metric of json.data) {
    result[metric.name] = metric.values?.[0]?.value ?? 0;
  }
  return result;
}

export interface IgAudience {
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export async function fetchInstagramAudience(igUserId: string, token: string): Promise<IgAudience> {
  const url = `${GRAPH_BASE}/${igUserId}?fields=followers_count,follows_count,media_count&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IG audience falló: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface IgComment {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  like_count?: number;
  replies?: { data: IgComment[] };
}

interface IgCommentsResponse {
  data: IgComment[];
  paging?: { next?: string };
}

/**
 * Comentarios de un media, con un nivel de respuestas anidadas incluido
 * en la misma llamada (`replies{...}`) — evita una llamada extra por
 * comentario. Best-effort, no fatal: devuelve lo que haya traído hasta
 * el punto de falla en vez de tumbar todo el sync de comentarios.
 */
export async function fetchInstagramComments(mediaId: string, token: string): Promise<IgComment[]> {
  const items: IgComment[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/${mediaId}/comments?fields=id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}&limit=50&access_token=${encodeURIComponent(token)}`;

  while (url) {
    // Diagnóstico (2): URL completa (sin el token) que se está llamando.
    console.log(`[ig-comments] GET ${url.replace(/access_token=[^&]+/, "access_token=<redacted>")}`);

    const res: Response = await fetch(url);
    if (!res.ok) {
      console.warn(`IG comments no disponibles para ${mediaId}: ${await res.text()}`);
      return items;
    }
    const json: IgCommentsResponse = await res.json();
    // Diagnóstico (3): respuesta cruda de Meta, antes de cualquier
    // procesamiento/aplanado (eso pasa después, en platforms/instagram.ts).
    console.log(`[ig-comments] respuesta cruda para media ${mediaId}:`, JSON.stringify(json, null, 2));
    items.push(...json.data);
    url = json.paging?.next;
  }
  return items;
}

/** Publica una respuesta a un comentario. Devuelve el id del comentario de respuesta creado. */
export async function postInstagramCommentReply(
  commentId: string,
  message: string,
  token: string
): Promise<string> {
  const url = `${GRAPH_BASE}/${commentId}/replies?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message }),
  });
  if (!res.ok) throw new Error(`IG reply falló: ${res.status} ${await res.text()}`);
  const json: { id: string } = await res.json();
  return json.id;
}

/** Demografía — best-effort: los nombres de esta métrica han cambiado varias veces. */
export async function fetchInstagramDemographics(
  igUserId: string,
  token: string
): Promise<Record<string, unknown>> {
  try {
    const url = `${GRAPH_BASE}/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}
