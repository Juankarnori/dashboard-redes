import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

/** Bucket público donde vive el archivo a publicar (foto/video) de cada pieza del calendario. */
export const CALENDAR_MEDIA_BUCKET = "calendar-media";

/**
 * URL pública de un archivo ya subido, directo en el dominio de
 * Supabase Storage. Sirve para Meta (Instagram/Facebook): sus APIs
 * pisan cualquier URL pública, sin exigencia de dominio verificado.
 */
export function getCalendarMediaUrl(supabase: SupabaseClient<Database>, mediaPath: string): string {
  return supabase.storage.from(CALENDAR_MEDIA_BUCKET).getPublicUrl(mediaPath).data.publicUrl;
}

/**
 * URL del mismo archivo, pero servida vía /api/media en nuestro propio
 * dominio en vez del de Supabase Storage. TikTok (Content Posting API,
 * PULL_FROM_URL) exige que `video_url` esté en un dominio verificado en
 * su Developer Portal — hoy eso es el dominio de esta app, no el de
 * Supabase — así que TikTok tiene que usar esta URL, no
 * `getCalendarMediaUrl`.
 */
export function getProxiedMediaUrl(mediaPath: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/api/media/${mediaPath}`;
}
