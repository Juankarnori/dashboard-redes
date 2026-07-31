import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/terms", "/privacy"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Si Supabase no responde (outage, red, credenciales mal puestas), no
  // tumbamos la app entera: tratamos la sesión como "no logueado" y
  // dejamos que la ruta protegida redirija a /login en vez de un 500.
  let user = null;
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser();
    user = fetchedUser;
  } catch (err) {
    console.error("middleware: no se pudo verificar la sesión con Supabase:", err);
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

// api/sync/* tiene su propia auth por Bearer token (SYNC_CRON_SECRET,
// ver lib/sync-auth.ts) — lo llama GitHub Actions sin sesión de
// navegador, así que no debe pasar por la verificación de sesión de acá.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/callback|api/sync).*)"],
};
