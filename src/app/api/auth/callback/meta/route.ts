import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, exchangeForLongLivedToken } from "@/lib/meta/oauth";
import { fetchManagedPages } from "@/lib/meta/graph";
import { encryptToken } from "@/lib/crypto";

const NONCE_COOKIE = "meta_oauth_nonce";

function errorRedirect(request: NextRequest, reason: string) {
  const url = new URL("/settings/accounts", request.url);
  url.searchParams.set("meta_error", reason);
  return NextResponse.redirect(url);
}

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
  if (!cookieNonce || cookieNonce !== nonce) {
    return errorRedirect(request, "csrf");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const pages = await fetchManagedPages(longLived.access_token);

    // Los tokens quedan cifrados desde este punto en adelante; nunca se
    // vuelven a escribir en claro en BD.
    const encryptedPages = pages.map((p) => ({
      ...p,
      page_access_token: encryptToken(p.page_access_token),
    }));

    const { data: session, error } = await supabase
      .from("oauth_sessions")
      .insert({
        owner_id: user.id,
        brand_id: brandId,
        provider: "facebook",
        user_access_token: encryptToken(longLived.access_token),
        available_pages: encryptedPages,
      })
      .select("id")
      .single();

    if (error || !session) {
      return errorRedirect(request, "no_se_pudo_guardar_sesion");
    }

    const response = NextResponse.redirect(
      new URL(`/settings/accounts/select?session=${session.id}`, request.url)
    );
    response.cookies.delete(NONCE_COOKIE);
    return response;
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return errorRedirect(request, "error_meta_api");
  }
}
