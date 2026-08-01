import { randomBytes, createHash } from "crypto";

/**
 * OAuth de TikTok (Login Kit). Dos diferencias grandes con Meta
 * (ver lib/meta/oauth.ts):
 *
 * 1. PKCE es obligatorio — no opcional como en algunos flujos de Meta.
 *    El `code_verifier` se genera en /api/auth/tiktok/start, viaja en una
 *    cookie httpOnly hasta el callback (igual que el nonce anti-CSRF), y
 *    se manda de vuelta al intercambiar el code por el token.
 * 2. El access token dura 24h (no ~60 días) y el refresh token ROTA en
 *    cada uso: la respuesta de refresh trae un refresh_token nuevo y el
 *    anterior queda inválido. Quien llame a refreshTikTokToken tiene que
 *    persistir el par completo de la respuesta — nunca reusar el
 *    refresh_token viejo. Ver recomputeAccountAlerts... no, ver el
 *    refresh en /api/sync (Paso 3) para el guardado atómico.
 */

const TIKTOK_VERSION = process.env.TIKTOK_API_VERSION ?? "v2";
const AUTH_BASE = "https://www.tiktok.com";
const API_BASE = `https://open.tiktokapis.com/${TIKTOK_VERSION}`;

/** Scopes agregados en el Login Kit del Sandbox (ver plan aprobado). */
export const TIKTOK_OAUTH_SCOPES = ["user.info.profile", "user.info.stats", "video.list"].join(",");

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/auth/callback/tiktok`;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Genera el par PKCE (S256). El verifier cae dentro del rango 43-128 que exige el spec. */
export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** URL del diálogo de login de TikTok. `state` debe ser impredecible (CSRF). */
export function buildTikTokLoginUrl(state: string, codeChallenge: string): string {
  const url = new URL(`${AUTH_BASE}/${TIKTOK_VERSION}/auth/authorize/`);
  url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY!);
  url.searchParams.set("scope", TIKTOK_OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface TikTokTokenResponse {
  access_token: string;
  expires_in: number; // segundos
  refresh_token: string;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TikTokTokenResponse> {
  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams(body),
  });
  const json: TikTokTokenResponse = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `TikTok oauth/token falló: ${res.status} ${json.error ?? ""} ${json.error_description ?? JSON.stringify(json)}`
    );
  }
  return json;
}

export async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TikTokTokenResponse> {
  return postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier,
  });
}

/**
 * Refresca el access token. ⚠️ El refresh_token de la respuesta es NUEVO
 * y el que se mandó queda inválido — el llamador debe guardar
 * access_token + refresh_token + expires_in de esta respuesta como una
 * unidad atómica (ver refreshTikTokAccountToken en el Paso 3).
 */
export async function refreshTikTokToken(refreshToken: string): Promise<TikTokTokenResponse> {
  return postToken({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    client_secret: process.env.TIKTOK_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export { API_BASE as TIKTOK_API_BASE };
