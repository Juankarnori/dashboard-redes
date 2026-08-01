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
