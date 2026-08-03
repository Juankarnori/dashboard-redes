import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { encryptToken } from "@/lib/crypto";
import type { PlatformProvider, ProviderAccount } from "./types";

type DB = SupabaseClient<Database>;

/**
 * Refresca el token de una cuenta si el provider lo soporta y hace
 * falta (ver PlatformProvider.refreshTokenIfNeeded — hoy solo TikTok).
 * Usado tanto por /api/sync como por la publicación manual desde
 * /calendar: una sola fuente de verdad para el requisito de guardar
 * access_token+refresh_token de forma atómica y loguear explícitamente
 * cualquier falla (nunca en silencio).
 */
export async function refreshAccountTokenIfNeeded(
  supabase: DB,
  provider: PlatformProvider,
  providerAccount: ProviderAccount,
  accountId: string
): Promise<ProviderAccount> {
  if (!provider.refreshTokenIfNeeded) return providerAccount;

  try {
    const refreshed = await provider.refreshTokenIfNeeded(providerAccount);
    if (!refreshed) return providerAccount;

    // Update único con los tres campos juntos: nunca queda un
    // access_token nuevo con el refresh_token viejo a medio camino.
    const { error } = await supabase
      .from("accounts")
      .update({
        access_token: encryptToken(refreshed.accessToken),
        refresh_token: encryptToken(refreshed.refreshToken),
        token_expires_at: refreshed.expiresAt,
      })
      .eq("id", accountId);

    if (error) {
      throw new Error(`Token refrescado pero no se pudo guardar: ${error.message}`);
    }

    return {
      ...providerAccount,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    };
  } catch (err) {
    console.error(`[token-refresh] Falló el refresh de token para cuenta ${accountId}:`, err);
    throw err;
  }
}
