import { TIKTOK_API_BASE } from "./oauth";

/**
 * Llamadas a la TikTok API v2 (Display/Login Kit). A diferencia de Meta,
 * TikTok autentica con header `Authorization: Bearer` en vez de
 * `access_token=` en la query string, y envuelve toda respuesta de datos
 * en `{ data, error }` — `error.code` es literalmente `"ok"` en éxito
 * (no viene ausente), así que hay que chequear el código, no la
 * presencia del campo.
 *
 * ⚠️ Nombres de campo y verbo HTTP a confirmar contra la documentación
 * viva de TikTok antes de depender de esto en producción — igual
 * cautela que tuvimos con el cambio de Meta a v22.0.
 */

export interface TikTokUserInfo {
  open_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

interface TikTokApiError {
  code: string;
  message: string;
  log_id?: string;
}

interface TikTokUserInfoResponse {
  data?: { user: TikTokUserInfo };
  error?: TikTokApiError;
}

const USER_INFO_FIELDS = [
  "open_id",
  "username",
  "display_name",
  "avatar_url",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
].join(",");

/** Perfil + estadísticas de cuenta (scopes user.info.profile + user.info.stats). */
export async function fetchTikTokUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const url = `${TIKTOK_API_BASE}/user/info/?fields=${USER_INFO_FIELDS}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: TikTokUserInfoResponse = await res.json();

  if (!res.ok || (json.error && json.error.code !== "ok")) {
    throw new Error(`TikTok user/info falló: ${res.status} ${JSON.stringify(json.error)}`);
  }
  if (!json.data?.user) {
    throw new Error("TikTok user/info: respuesta sin data.user");
  }
  return json.data.user;
}

export interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number; // epoch, segundos
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

interface TikTokVideoListResponse {
  data?: { videos: TikTokVideo[]; cursor?: number; has_more?: boolean };
  error?: TikTokApiError;
}

const VIDEO_FIELDS = [
  "id",
  "title",
  "video_description",
  "duration",
  "cover_image_url",
  "share_url",
  "create_time",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
].join(",");

/**
 * Videos del usuario (scope video.list). A diferencia de user/info, este
 * endpoint es POST con el cursor en el body (paginación por cursor
 * numérico, no por URL de "next" como Meta). Best-effort: si falla a
 * mitad de la paginación, devuelve lo que haya traído hasta ahí.
 */
export async function fetchTikTokVideos(accessToken: string): Promise<TikTokVideo[]> {
  const videos: TikTokVideo[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${TIKTOK_API_BASE}/video/list/?fields=${VIDEO_FIELDS}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: 20, cursor }),
    });
    const json: TikTokVideoListResponse = await res.json();

    if (!res.ok || (json.error && json.error.code !== "ok")) {
      console.warn(`TikTok video/list falló: ${res.status} ${JSON.stringify(json.error)}`);
      return videos;
    }
    const data = json.data;
    if (!data || data.videos.length === 0) break;

    videos.push(...data.videos);
    hasMore = !!data.has_more;
    cursor = data.cursor ?? cursor + data.videos.length;
  }

  return videos;
}

interface TikTokInboxUploadResponse {
  data?: { publish_id: string };
  error?: TikTokApiError;
}

/**
 * Sube un video al inbox del creador (Content Posting API, scope
 * video.upload — modo "Draft", NO "Direct Post"/video.publish). El video
 * llega a la app de TikTok del usuario como borrador; la persona lo
 * termina de publicar a mano. Usa PULL_FROM_URL: TikTok descarga el
 * archivo desde `videoUrl`, que por eso tiene que estar en un dominio
 * verificado ante TikTok (ver getProxiedMediaUrl en lib/supabase/storage.ts
 * — la URL de Supabase Storage NO sirve para esto).
 *
 * Endpoint y forma de la respuesta confirmados contra la documentación
 * oficial de TikTok. `publish_id` (formato `v_inbox_url~v2.xxx`) se
 * guarda como external_post_id. Rate limit: 6 req/min por access token
 * — no hay reintento automático acá si se pisa el límite, el error de
 * TikTok sube tal cual hasta publish_error.
 */
export async function uploadTikTokVideoToInbox(accessToken: string, videoUrl: string): Promise<string> {
  const url = `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl },
    }),
  });
  const json: TikTokInboxUploadResponse = await res.json();

  if (!res.ok || (json.error && json.error.code !== "ok")) {
    throw new Error(`TikTok upload a inbox falló: ${res.status} ${JSON.stringify(json.error)}`);
  }
  if (!json.data?.publish_id) {
    throw new Error("TikTok upload a inbox: respuesta sin publish_id");
  }
  return json.data.publish_id;
}
