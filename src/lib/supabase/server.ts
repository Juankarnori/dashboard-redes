import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Usa la sesión del usuario logueado → las políticas RLS
 * filtran automáticamente por owner_id.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // set() llamado desde un Server Component sin poder escribir
            // cookies (ej. render estático). El middleware refresca la
            // sesión, así que es seguro ignorar esto aquí.
          }
        },
      },
    }
  );
}
