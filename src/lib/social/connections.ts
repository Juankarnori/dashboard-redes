import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform } from "@/types/db";
import { getComposioClient } from "./client";

type DB = SupabaseClient<Database>;

export type ComposioConnection = Database["public"]["Tables"]["composio_connections"]["Row"];

/** Conexiones activas de un negocio, opcionalmente filtradas por red. */
export async function getComposioConnections(
  supabase: DB,
  brandId: string,
  platform?: Platform
): Promise<ComposioConnection[]> {
  let query = supabase.from("composio_connections").select("*").eq("brand_id", brandId).eq("status", "active");
  if (platform) query = query.eq("platform", platform);
  const { data } = await query.order("connected_at", { ascending: true });
  return data ?? [];
}

/**
 * Auth config a usar para iniciar una conexión de un toolkit — reusa el
 * primero que ya exista (típicamente el que ya armaste a mano en el
 * dashboard de Composio, o uno creado antes por esta misma función); si
 * no hay ninguno, crea uno nuevo con auth administrada por Composio
 * (sirve para Instagram/Facebook — no para TikTok, que necesita tu app
 * propia, ver getOrCreateTikTokAuthConfig).
 */
export async function getOrCreateManagedAuthConfig(toolkit: string): Promise<string> {
  const composio = getComposioClient();
  const existing = await composio.authConfigs.list({ toolkit });
  if (existing.items.length > 0) return existing.items[0].id;

  const created = await composio.authConfigs.create(toolkit);
  return created.id;
}

/**
 * Auth config de TikTok con credenciales propias (TIKTOK_CLIENT_KEY/
 * SECRET, las mismas de la integración directa actual — ver
 * lib/tiktok/oauth.ts) — TikTok exige tu propia app, no la managed de
 * Composio (ver gotcha del brief). Reusa el existente si ya lo creaste.
 *
 * ⚠️ SIN VERIFICAR contra la API real de Composio: `credentials` es un
 * record genérico a nivel de SDK (`Record<string, string|number|boolean>`,
 * ver authConfigs.types.ts) — las claves exactas que TikTok espera
 * (`client_id`/`client_secret` es la convención snake_case que usa el
 * resto del SDK, pero no está confirmada específicamente para TikTok)
 * las valida el backend de Composio, no algo visible en los tipos del
 * SDK. Antes de confiar en esto: probarlo con COMPOSIO_API_KEY real, o
 * crear el auth config una vez a mano en el dashboard de Composio
 * (Toolkits → TikTok → Configure) e inspeccionar el payload que arma esa
 * UI (Network tab) para confirmar los nombres de campo.
 */
export async function getOrCreateTikTokAuthConfig(): Promise<string> {
  const composio = getComposioClient();
  const existing = await composio.authConfigs.list({ toolkit: "tiktok" });
  if (existing.items.length > 0) return existing.items[0].id;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error(
      "Faltan TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET en el entorno — hacen falta para crear el auth config de TikTok en Composio (TikTok no acepta la auth administrada de Composio)."
    );
  }

  const created = await composio.authConfigs.create("tiktok", {
    type: "use_custom_auth",
    name: "TikTok (app propia)",
    authScheme: "OAUTH2",
    credentials: { client_id: clientKey, client_secret: clientSecret },
  });
  return created.id;
}
