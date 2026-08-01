import type { Platform } from "@/types/db";
import type { PlatformProvider } from "./types";
import { instagramProvider } from "./instagram";
import { facebookProvider } from "./facebook";
import { tiktokProvider } from "./tiktok";

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
