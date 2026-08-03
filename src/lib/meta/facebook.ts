import { GRAPH_BASE } from "./oauth";

/**
 * Llamadas a la Facebook Graph API para una Page. Igual que en
 * instagram.ts: los insights de Page/post son el área más volátil de la
 * API — están aislados y fallan de forma no fatal.
 *
 * 'post_impressions' quedó deprecado (mismo cambio de Graph API v22.0 que
 * unificó todo en 'views' del lado de Instagram) y se quitó del pedido.
 * 'post_impressions_unique' (reach) sigue vigente y es la base para todo
 * tipo de post. A diferencia de Instagram, Meta no documenta un campo
 * 'views' unificado para Page posts — el más cercano confirmado es
 * `post_video_views`, que solo aplica a posts de video, así que se pide
 * aparte (pedir una métrica inválida para el tipo de objeto puede tumbar
 * la llamada completa). Verifica esto contra Graph API Explorer con una
 * Page real antes de confiar en `impressions` para posts de video.
 */

export interface FbPost {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time: string;
  attachments?: {
    data?: { media_type?: string; type?: string; media?: { image?: { src?: string } } }[];
  };
  shares?: { count: number };
  reactions?: { summary?: { total_count: number } };
  comments?: { summary?: { total_count: number } };
}

interface FbPostsResponse {
  data: FbPost[];
  paging?: { next?: string };
}

export async function fetchFacebookPosts(pageId: string, token: string): Promise<FbPost[]> {
  const items: FbPost[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/${pageId}/posts?fields=id,message,full_picture,permalink_url,created_time,attachments{media_type,type,media},shares,reactions.summary(true),comments.summary(true)&limit=50&access_token=${encodeURIComponent(token)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`FB /posts falló: ${res.status} ${await res.text()}`);
    const json: FbPostsResponse = await res.json();
    items.push(...json.data);
    url = json.paging?.next;
  }
  return items;
}

const POST_METRICS = "post_impressions_unique";
const VIDEO_POST_METRICS = "post_impressions_unique,post_video_views";

/** Insights de un post: alcance (+ views si es video). Best-effort, no fatal. */
export async function fetchPostInsights(
  postId: string,
  token: string,
  isVideo = false
): Promise<Record<string, number>> {
  const metrics = isVideo ? VIDEO_POST_METRICS : POST_METRICS;
  const url = `${GRAPH_BASE}/${postId}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`FB insights no disponibles para ${postId}: ${await res.text()}`);
    return {};
  }
  const json: { data: { name: string; values: { value: number }[] }[] } = await res.json();
  const result: Record<string, number> = {};
  for (const metric of json.data) {
    result[metric.name] = metric.values?.[0]?.value ?? 0;
  }
  return result;
}

export interface FbComment {
  id: string;
  message: string;
  from?: { name?: string; id?: string };
  created_time: string;
  like_count?: number;
  comments?: { data: FbComment[] };
}

interface FbCommentsResponse {
  data: FbComment[];
  paging?: { next?: string };
}

/**
 * Comentarios de un post, con un nivel de respuestas anidadas incluido
 * en la misma llamada (`comments{...}`). Best-effort, no fatal.
 */
export async function fetchFacebookComments(postId: string, token: string): Promise<FbComment[]> {
  const items: FbComment[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/${postId}/comments?fields=id,message,from,created_time,like_count,comments{id,message,from,created_time,like_count}&filter=stream&limit=50&access_token=${encodeURIComponent(token)}`;

  while (url) {
    // Diagnóstico (2): URL completa (sin el token) que se está llamando.
    console.log(`[fb-comments] GET ${url.replace(/access_token=[^&]+/, "access_token=<redacted>")}`);

    const res: Response = await fetch(url);
    if (!res.ok) {
      console.warn(`FB comments no disponibles para ${postId}: ${await res.text()}`);
      return items;
    }
    const json: FbCommentsResponse = await res.json();
    // Diagnóstico (3): respuesta cruda de Meta, antes de cualquier
    // procesamiento/aplanado (eso pasa después, en platforms/facebook.ts).
    console.log(`[fb-comments] respuesta cruda para post ${postId}:`, JSON.stringify(json, null, 2));
    items.push(...json.data);
    url = json.paging?.next;
  }
  return items;
}

/** Publica una respuesta a un comentario. Devuelve el id del comentario de respuesta creado. */
export async function postFacebookCommentReply(
  commentId: string,
  message: string,
  token: string
): Promise<string> {
  const url = `${GRAPH_BASE}/${commentId}/comments?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message }),
  });
  if (!res.ok) throw new Error(`FB reply falló: ${res.status} ${await res.text()}`);
  const json: { id: string } = await res.json();
  return json.id;
}

export interface FbPublishResult {
  postId: string;
  permalink?: string;
}

/**
 * Publica una foto en la Page vía /photos — a diferencia de Instagram,
 * es un único llamado síncrono (sin container ni paso de estado).
 * Devuelve el post_id (el de la foto en sí; Meta lo linkea a un post
 * del feed automáticamente) y su permalink cuando lo puede resolver.
 */
export async function publishFacebookPhoto(
  pageId: string,
  token: string,
  input: { imageUrl: string; caption: string }
): Promise<FbPublishResult> {
  const url = `${GRAPH_BASE}/${pageId}/photos`;
  const res = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ url: input.imageUrl, caption: input.caption, access_token: token }),
  });
  if (!res.ok) throw new Error(`FB publicar foto falló: ${res.status} ${await res.text()}`);
  const json: { id: string; post_id?: string } = await res.json();
  const postId = json.post_id ?? json.id;
  return { postId, permalink: await fetchFacebookPermalink(postId, token) };
}

/** Publica un video en la Page vía /videos — también síncrono, sin container. */
export async function publishFacebookVideo(
  pageId: string,
  token: string,
  input: { videoUrl: string; caption: string }
): Promise<FbPublishResult> {
  const url = `${GRAPH_BASE}/${pageId}/videos`;
  const res = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ file_url: input.videoUrl, description: input.caption, access_token: token }),
  });
  if (!res.ok) throw new Error(`FB publicar video falló: ${res.status} ${await res.text()}`);
  const json: { id: string } = await res.json();
  return { postId: json.id, permalink: await fetchFacebookPermalink(json.id, token) };
}

async function fetchFacebookPermalink(postId: string, token: string): Promise<string | undefined> {
  const url = `${GRAPH_BASE}/${postId}?fields=permalink_url&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const json: { permalink_url?: string } = await res.json();
  return json.permalink_url;
}

export interface FbAudience {
  followers_count?: number;
  fan_count?: number;
}

export async function fetchFacebookAudience(pageId: string, token: string): Promise<FbAudience> {
  const url = `${GRAPH_BASE}/${pageId}?fields=followers_count,fan_count&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FB audience falló: ${res.status} ${await res.text()}`);
  return res.json();
}
