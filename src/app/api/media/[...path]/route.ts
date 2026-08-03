import { NextResponse, type NextRequest } from "next/server";
import { CALENDAR_MEDIA_BUCKET } from "@/lib/supabase/storage";

// Edge en vez de Node: esto solo relaya bytes (sin tocar la BD), y el
// modelo de streaming de Edge es más tolerante para esto que una
// Serverless Function de Hobby con su límite de 10s por invocación.
export const runtime = "edge";

/**
 * Proxy de solo lectura hacia el bucket público calendar-media, servido
 * desde nuestro dominio. Existe por una sola razón: TikTok (Content
 * Posting API, PULL_FROM_URL) exige que `video_url` esté en un dominio
 * verificado en su Developer Portal, y ese dominio es este, no el de
 * Supabase Storage — no hay forma de verificar el dominio de Storage
 * sin un dominio custom (feature paga de Supabase). Ver
 * getProxiedMediaUrl en lib/supabase/storage.ts.
 *
 * El bucket ya es público de lectura — cualquiera con el path puede
 * pedirle el archivo directo a Supabase de todos modos — así que este
 * proxy no reduce la exposición, solo cambia el dominio desde el que
 * se sirve. No hace falta validarlo contra content_calendar.
 *
 * Reenvía el header Range: varios fetchers de video piden el archivo
 * por partes en vez de una sola descarga completa.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const mediaPath = path.join("/");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const targetUrl = `${supabaseUrl}/storage/v1/object/public/${CALENDAR_MEDIA_BUCKET}/${mediaPath}`;

  const range = request.headers.get("range");
  const upstream = await fetch(targetUrl, range ? { headers: { range } } : undefined);

  if (!upstream.ok && upstream.status !== 206) {
    // Reflejamos el status real de Supabase tal cual (sin fabricar un
    // 502 genérico) — es un proxy transparente, no una capa de negocio.
    return NextResponse.json({ error: "No se pudo obtener el archivo" }, { status: upstream.status });
  }
  if (!upstream.body) {
    return NextResponse.json({ error: "Archivo vacío" }, { status: 502 });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "public, max-age=3600");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
