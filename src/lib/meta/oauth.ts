/**
 * OAuth de Meta (Facebook Login para Business) — intercambio de código
 * por token y upgrade a token de larga duración.
 *
 * La app usa el producto "Facebook Login for Business": el diálogo de
 * autorización no recibe los permisos por `scope`, sino por `config_id`,
 * apuntando a una Configuration creada en Meta for Developers (App →
 * Facebook Login for Business → Configurations). Los permisos abajo no
 * se envían en la URL — son documentación de lo que esa Configuration
 * debe tener habilitado.
 * https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
 */

// v22.0+: 'impressions'/'video_views' quedaron deprecados en favor de
// 'views' (ver lib/meta/instagram.ts) — no bajar de v22.0.
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permisos que debe incluir la Configuration de META_LOGIN_CONFIG_ID. */
export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  // Gestión de comentarios (leer/responder) — agregar en la Configuration
  // y reconectar las cuentas para que el token los incluya.
  "instagram_manage_comments",
  "pages_manage_engagement", // reaccionar/gestionar engagement (no alcanza para leer)
  "pages_read_user_content", // el que de verdad exige Meta para LEER comentarios de la Page
  // Publicación desde /calendar (Fase 6).
  "instagram_content_publish",
  "pages_manage_posts",
].join(",");

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/callback/meta`;
}

/**
 * URL del diálogo de login de Meta. `state` debe ser impredecible (CSRF).
 * Facebook Login for Business usa `config_id` en vez de `scope` — los
 * permisos viven en la Configuration referenciada por
 * META_LOGIN_CONFIG_ID, no en esta URL.
 */
export function buildMetaLoginUrl(state: string): string {
  const configId = process.env.META_LOGIN_CONFIG_ID;
  if (!configId) {
    throw new Error("Falta META_LOGIN_CONFIG_ID (id de la Configuration de Facebook Login for Business)");
  }

  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("config_id", configId);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(code: string): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Meta oauth/access_token falló: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Cambia un user access token de corta duración (~2h) por uno de ~60 días. */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Meta long-lived token exchange falló: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export { GRAPH_BASE, GRAPH_VERSION };
