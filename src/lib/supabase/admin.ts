import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

/**
 * Cliente con service_role: bypasa RLS. Úsalo SOLO en contextos sin
 * sesión de usuario (ej. /api/sync disparado por GitHub Actions).
 * Nunca lo importes desde código que corre en el navegador.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
