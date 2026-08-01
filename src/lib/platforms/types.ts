import type { Platform } from "@/types/db";

/**
 * Contrato común que debe implementar cada red social para que
 * /api/sync (Fase 2) pueda iterar sobre todas sin conocer sus detalles.
 * Agregar una red nueva (ej. TikTok) = escribir un archivo que
 * implemente esta interfaz y registrarlo en ./index.ts — nada más
 * cambia: ni el endpoint de sync, ni el esquema de BD.
 */
export interface PlatformProvider {
  readonly platform: Platform;

  /** Trae posts/reels permanentes recientes y sus métricas actuales. */
  fetchContent(account: ProviderAccount): Promise<ProviderContentItem[]>;

  /**
   * Trae historias activas (expiran a las 24h). Opcional: no todas las
   * redes lo soportan (ej. Facebook no expone un endpoint de stories
   * confiable vía Graph API). El sync lo llama con más frecuencia que
   * fetchContent para no perderlas antes de que desaparezcan.
   */
  fetchStories?(account: ProviderAccount): Promise<ProviderContentItem[]>;

  /** Trae métricas de audiencia (seguidores, demografía) de la cuenta. */
  fetchAudience(account: ProviderAccount): Promise<ProviderAudienceSnapshot>;

  /**
   * Trae comentarios (con un nivel de respuestas anidadas) de una pieza
   * de contenido puntual. Opcional: se agrega según haga falta por red.
   */
  fetchComments?(contentExternalId: string, account: ProviderAccount): Promise<ProviderComment[]>;

  /** Publica una respuesta a un comentario. Devuelve el id del comentario de respuesta creado. */
  postCommentReply?(commentExternalId: string, message: string, account: ProviderAccount): Promise<string>;

  /**
   * Si el access_token está vencido o por vencer, lo refresca y devuelve
   * el par nuevo (+ nueva expiración). Devuelve null si no hacía falta.
   * Opcional: solo lo implementan redes con tokens de corta duración y
   * refresh_token propio (TikTok). Los Page Access Token de Meta son de
   * larga duración y no tienen este mecanismo.
   */
  refreshTokenIfNeeded?(account: ProviderAccount): Promise<RefreshedToken | null>;
}

export interface RefreshedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export interface ProviderComment {
  externalId: string;
  /** Presente si es una respuesta ya existente en la plataforma (no una que generamos nosotros). */
  parentExternalId?: string;
  authorName?: string;
  authorPlatformId?: string;
  text: string;
  likeCount?: number;
  commentedAt?: string;
}

export interface ProviderAccount {
  id: string;
  externalId: string;
  accessToken: string; // ya descifrado por el llamador
  refreshToken?: string; // ya descifrado por el llamador — solo redes con refresh (TikTok)
  tokenExpiresAt?: string | null;
}

export interface ProviderContentItem {
  externalId: string;
  type: "post" | "reel" | "story" | "carousel" | "video";
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  publishedAt?: string;
  expiresAt?: string; // historias
  metrics: {
    reach?: number;
    impressions?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    extra?: Record<string, unknown>; // taps_forward, exits, replies…
  };
}

export interface ProviderAudienceSnapshot {
  followers?: number;
  follows?: number;
  mediaCount?: number;
  demographics?: Record<string, unknown>;
}
