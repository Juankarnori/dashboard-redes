import type { Platform } from "@/types/db";
import type { PlatformProvider } from "./types";
import { instagramProvider } from "./instagram";
import { facebookProvider } from "./facebook";

/**
 * Registro de providers por red. /api/sync resuelve el provider correcto
 * a partir de `accounts.platform` y lo usa sin saber nada específico de
 * Meta, TikTok, etc.
 *
 * Para agregar TikTok más adelante:
 *   1. crear src/lib/platforms/tiktok.ts implementando PlatformProvider
 *   2. registrarlo aquí: registry.tiktok = tiktokProvider
 * No hace falta tocar el esquema de BD ni el endpoint de sync.
 */
export const registry: Partial<Record<Platform, PlatformProvider>> = {
  instagram: instagramProvider,
  facebook: facebookProvider,
  // tiktok: tiktokProvider, // futuro
};

export function getProvider(platform: Platform): PlatformProvider {
  const provider = registry[platform];
  if (!provider) {
    throw new Error(`No hay PlatformProvider registrado para "${platform}" todavía.`);
  }
  return provider;
}
