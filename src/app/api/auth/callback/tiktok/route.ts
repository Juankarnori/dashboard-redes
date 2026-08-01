import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/tiktok/oauth";
import { fetchTikTokUserInfo } from "@/lib/tiktok/api";
import { encryptToken } from "@/lib/crypto";

const NONCE_COOKIE = "tiktok_oauth_nonce";
const VERIFIER_COOKIE = "tiktok_oauth_verifier";

function errorRedirect(request: NextRequest, reason: string) {
  const url = new URL("/settings/accounts", request.url);
  url.searchParams.set("tiktok_error", reason);
  return NextResponse.redirect(url);
}

/**
 * Callback del login de TikTok. A diferencia de Meta, acá no hay paso
 * intermedio de "elegí qué cuenta conectar" (ver oauth_sessions +
 * /settings/accounts/select): el login de TikTok autentica una sola
 * cuenta por corrida (la que inició sesión en el popup), así que se
 * puede insertar directo en `accounts`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("error")) {
    return errorRedirect(request, params.get("error_description") ?? "acceso_denegado");
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return errorRedirect(request, "faltan_parametros");
  }

  let brandId: string;
  let nonce: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    brandId = decoded.brandId;
    nonce = decoded.nonce;
  } catch {
    return errorRedirect(request, "state_invalido");
  }

  const cookieNonce = request.cookies.get(NONCE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect(request, "csrf");
  }
  if (!codeVerifier) {
    return errorRedirect(request, "falta_pkce_verifier");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: brand } = await supabase.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) {
    return errorRedirect(request, "negocio_no_encontrado");
  }

  try {
    const token = await exchangeCodeForToken(code, codeVerifier);
    const profile = await fetchTikTokUserInfo(token.access_token);
    const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    // Tokens cifrados desde este punto en adelante; nunca en claro en BD.
    const { error } = await supabase.from("accounts").upsert(
      {
        brand_id: brandId,
        platform: "tiktok",
        role: "creator",
        external_id: token.open_id,
        username: profile.username ?? null,
        display_name: profile.display_name ?? profile.username ?? null,
        profile_image_url: profile.avatar_url ?? null,
        access_token: encryptToken(token.access_token),
        refresh_token: encryptToken(token.refresh_token),
        token_expires_at: tokenExpiresAt,
        status: "active",
      },
      { onConflict: "platform,external_id" }
    );

    if (error) {
      console.error("No se pudo guardar la cuenta de TikTok:", error);
      return errorRedirect(request, "no_se_pudo_guardar_cuenta");
    }

    const response = NextResponse.redirect(new URL("/settings/accounts", request.url));
    response.cookies.delete(NONCE_COOKIE);
    response.cookies.delete(VERIFIER_COOKIE);
    return response;
  } catch (err) {
    console.error("TikTok OAuth callback error:", err);
    return errorRedirect(request, "error_tiktok_api");
  }
}
