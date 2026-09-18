import type { Platform } from "@/types/db";
import type { PlatformProvider } from "./types";
import { instagramComposioProvider } from "./instagram-composio";
import { facebookComposioProvider } from "./facebook-composio";
import { tiktokComposioProvider } from "./tiktok-composio";

const composioRegistry: Partial<Record<Platform, PlatformProvider>> = {
  instagram: instagramComposioProvider,
  facebook: facebookComposioProvider,
  tiktok: tiktokComposioProvider,
};

export function getComposioProvider(platform: Platform): PlatformProvider | undefined {
  return composioRegistry[platform];
}

/**
 * Fallback por MÉTODO, no por cuenta: cada método opcional de
 * PlatformProvider (fetchStories, fetchComments, postCommentReply,
 * publishContent, checkPublishStatus, refreshTokenIfNeeded) se resuelve
 * a la implementación Composio si existe, o si no a la del provider
 * directo — así una cuenta con conexión Composio activa sigue usando el
 * camino directo para todo lo que Composio todavía no implementa (hoy:
 * comentarios y publicar, ver Fase 3) sin que el sync tenga que saberlo.
 *
 * fetchContent/fetchAudience son obligatorios en la interfaz — siempre
 * los toma de `composio` cuando esta función se usa (solo se llama
 * cuando ya se confirmó que hay una conexión activa, ver
 * resolveProviderForAccount en index.ts).
 */
export function mergeProviders(composio: PlatformProvider, direct: PlatformProvider): PlatformProvider {
  return {
    platform: composio.platform,
    fetchContent: composio.fetchContent,
    fetchAudience: composio.fetchAudience,
    fetchStories: composio.fetchStories ?? direct.fetchStories,
    fetchComments: composio.fetchComments ?? direct.fetchComments,
    fetchCommentActivity: composio.fetchCommentActivity ?? direct.fetchCommentActivity,
    postCommentReply: composio.postCommentReply ?? direct.postCommentReply,
    publishContent: composio.publishContent ?? direct.publishContent,
    checkPublishStatus: composio.checkPublishStatus ?? direct.checkPublishStatus,
    // El refresh de token es un concepto puramente de la integración
    // directa (OAuth propio) — Composio administra sus propios tokens
    // puertas adentro, así que este método SIEMPRE es el directo,
    // nunca algo que un provider Composio necesite implementar.
    refreshTokenIfNeeded: direct.refreshTokenIfNeeded,
  };
}
