import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { buildMetaLoginUrl } from "@/lib/meta/oauth";

const NONCE_COOKIE = "meta_oauth_nonce";

/**
 * Inicia el flujo OAuth de Meta para un negocio concreto.
 * GET /api/auth/meta/start?brand_id=<uuid>
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

  const response = NextResponse.redirect(buildMetaLoginUrl(state));
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 min: tiempo suficiente para completar el login en Meta
    path: "/",
  });
  return response;
}
