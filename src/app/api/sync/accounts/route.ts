import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSyncRequest } from "@/lib/sync-auth";

/**
 * Lista las cuentas activas para que el GitHub Action sepa a qué
 * account_id llamar en /api/sync (uno por invocación, para no chocar
 * con el timeout de 10s de las funciones de Vercel Hobby).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, platform, brand_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data });
}
