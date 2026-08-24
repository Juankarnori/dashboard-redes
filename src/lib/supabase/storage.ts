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

/**
 * Bucket público donde se cachean miniaturas cuyo origen expira (hoy solo
 * TikTok: `cover_image_url` es una URL firmada que deja de servir a los
 * pocos días — ver cacheRemoteThumbnail más abajo, llamada desde
 * /api/sync/route.ts). Guardamos
 * nuestra propia copia estable en vez de depender de esa URL firmada.
 */
export const CONTENT_THUMBNAILS_BUCKET = "content-thumbnails";

function contentThumbnailsBaseUrl(supabase: SupabaseClient<Database>): string {
  // getPublicUrl con path vacío nos da el prefijo del bucket sin tener
  // que armarlo a mano a partir de NEXT_PUBLIC_SUPABASE_URL.
  return supabase.storage.from(CONTENT_THUMBNAILS_BUCKET).getPublicUrl("").data.publicUrl;
}

/** True si `url` ya es una miniatura cacheada por nosotros (evita re-descargarla en cada sync). */
export function isCachedThumbnailUrl(supabase: SupabaseClient<Database>, url: string): boolean {
  return url.startsWith(contentThumbnailsBaseUrl(supabase));
}

/**
 * Descarga `remoteUrl` y la sube a `CONTENT_THUMBNAILS_BUCKET` bajo
 * `path`, devolviendo la URL pública estable. `null` si algo falla (red,
 * status no-2xx, error de Storage) — el caller debe caer de vuelta a la
 * URL original en ese caso, nunca dejar la pieza sin miniatura por esto.
 */
export async function cacheRemoteThumbnail(
  supabase: SupabaseClient<Database>,
  path: string,
  remoteUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(`[thumbnail-cache] GET ${remoteUrl} devolvió ${res.status} — se mantiene la URL original.`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());

    const { error } = await supabase.storage
      .from(CONTENT_THUMBNAILS_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) {
      console.warn(`[thumbnail-cache] No se pudo subir ${path}:`, error.message);
      return null;
    }

    return supabase.storage.from(CONTENT_THUMBNAILS_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn(`[thumbnail-cache] Error cacheando ${remoteUrl}:`, err);
    return null;
  }
}
