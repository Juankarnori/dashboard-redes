import type { NextRequest } from "next/server";

/**
 * /api/sync no tiene sesión de usuario (lo llama GitHub Actions), así
 * que se protege con un bearer token compartido en vez de Supabase Auth.
 */
export function isAuthorizedSyncRequest(request: NextRequest): boolean {
  const expected = process.env.SYNC_CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  return header.slice("Bearer ".length) === expected;
}
