import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { buildTikTokLoginUrl, generatePkcePair } from "@/lib/tiktok/oauth";

const NONCE_COOKIE = "tiktok_oauth_nonce";
const VERIFIER_COOKIE = "tiktok_oauth_verifier";

/**
 * Inicia el flujo OAuth de TikTok para un negocio concreto.
 * GET /api/auth/tiktok/start?brand_id=<uuid>
 *
 * A diferencia de /api/auth/meta/start, acá también generamos el par
 * PKCE — el verifier viaja en una cookie httpOnly hasta el callback,
 * igual que el nonce anti-CSRF.
 */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brand_id");
  if (!brandId) {
    return NextResponse.json({ error: "Falta brand_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Confirma que el negocio es del usuario logueado (RLS también lo protege).
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  }

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ brandId, nonce })).toString("base64url");
  const { verifier, challenge } = generatePkcePair();

  const response = NextResponse.redirect(buildTikTokLoginUrl(state, challenge));
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10, // 10 min: tiempo suficiente para completar el login en TikTok
    path: "/",
  };
  response.cookies.set(NONCE_COOKIE, nonce, cookieOptions);
  response.cookies.set(VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}
