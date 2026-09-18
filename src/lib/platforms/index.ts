import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform } from "@/types/db";
import type { PlatformProvider } from "./types";
import { instagramProvider } from "./instagram";
import { facebookProvider } from "./facebook";
import { tiktokProvider } from "./tiktok";
import { getComposioProvider, mergeProviders } from "./composio-adapter";

type DB = SupabaseClient<Database>;

/**
 * Registro de providers por red. /api/sync resuelve el provider correcto
 * a partir de `accounts.platform` y lo usa sin saber nada específico de
 * Meta, TikTok, etc.
 */
export const registry: Partial<Record<Platform, PlatformProvider>> = {
  instagram: instagramProvider,
  facebook: facebookProvider,
  tiktok: tiktokProvider,
};

export function getProvider(platform: Platform): PlatformProvider {
  const provider = registry[platform];
  if (!provider) {
    throw new Error(`No hay PlatformProvider registrado para "${platform}" todavía.`);
  }
  return provider;
}

export interface ResolvedProvider {
  provider: PlatformProvider;
  /** Presente cuando se resolvió una conexión Composio activa para esta cuenta — se mezcla en el ProviderAccount que arma el caller. */
  composio?: { userId: string; connectedAccountId: string };
}

/**
 * Fase 2: por cuenta, preferí Composio si hay una conexión activa y
 * linkeada (composio_connections.account_id — ver migración 0016 y
 * confirmComposioConnection); si no, seguí con el provider directo tal
 * cual funcionaba hasta ahora. El merge es por MÉTODO, no todo-o-nada
 * (ver mergeProviders en composio-adapter.ts): una cuenta con Composio
 * activo igual usa el camino directo para lo que Composio no
 * implementa todavía (comentarios, publicar — Fase 3).
 */
export async function resolveProviderForAccount(supabase: DB, accountId: string, platform: Platform): Promise<ResolvedProvider> {
  const direct = getProvider(platform);
  const composioProvider = getComposioProvider(platform);
  if (!composioProvider) return { provider: direct };

  const { data: connection } = await supabase
    .from("composio_connections")
    .select("composio_user_id, composio_connected_account_id")
    .eq("account_id", accountId)
    .eq("status", "active")
    .maybeSingle();

  if (!connection) return { provider: direct };

  return {
    provider: mergeProviders(composioProvider, direct),
    composio: { userId: connection.composio_user_id, connectedAccountId: connection.composio_connected_account_id },
  };
}
