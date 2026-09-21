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

  /**
   * Señal barata de "a qué publicaciones les entraron comentarios": un
   * listado (no una llamada por post) con la última actividad de cada
   * pieza publicada desde `since` (ISO). El sync de comentarios la usa
   * para volver a pedir comentarios de contenido MÁS VIEJO que la ventana
   * de COMMENTS_LOOKBACK_DAYS solo cuando hay actividad nueva. Opcional:
   * sin esto el sync mira solo la ventana reciente, como siempre.
   */
  fetchCommentActivity?(account: ProviderAccount, since: string): Promise<CommentActivityItem[]>;

  /**
   * Mensajes directos (Messenger / Instagram DM): hilos de la cuenta, el más
   * reciente primero. Solo los implementan los providers Composio — la
   * integración directa no tiene DMs. `after` es el cursor de la página
   * siguiente cuando la red lo soporta (Instagram sí; el tool de Facebook no
   * expone cursor, se ve solo lo más reciente hasta `limit`).
   */
  fetchConversations?(account: ProviderAccount, opts?: { limit?: number; after?: string }): Promise<ConversationPage>;

  /** Mensajes de un hilo, ORDENADOS del más viejo al más nuevo. Sin paginar: los más recientes hasta `limit`. */
  fetchMessages?(conversationExternalId: string, account: ProviderAccount, opts?: { limit?: number }): Promise<ProviderMessage[]>;

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

  /**
   * Publica una pieza nueva. Opcional: cada red la implementa muy
   * distinto (Meta publica de verdad y devuelve un permalink; TikTok en
   * modo Draft solo entrega el archivo al inbox del creador, que lo
   * termina de publicar a mano en la app — ver PublishResult).
   */
  publishContent?(input: PublishInput, account: ProviderAccount): Promise<PublishResult>;

  /**
   * Solo lo implementa Instagram: el container de video se procesa de
   * forma asíncrona del lado de Meta y puede tardar más de lo que dura
   * una invocación serverless (Vercel Hobby, 10s). El caller lo pollea
   * desde el cliente hasta que deje de estar "processing".
   */
  checkPublishStatus?(containerId: string, account: ProviderAccount): Promise<PublishResult>;
}

export interface PublishMediaItem {
  url: string; // URL pública (Supabase Storage, o el proxy /api/media para TikTok) — las 3 APIs la piden, no aceptan upload binario directo
  type: "image" | "video";
}

/**
 * `media` es un arreglo a propósito (Fase 6): 1 elemento = publicación
 * simple (imagen o video, como siempre fue), 2+ elementos = carrusel —
 * y un carrusel es siempre de imágenes (ninguna de las 3 redes mezcla
 * video con imágenes en un carrusel armado desde acá). Cada provider
 * valida esa regla y el máximo de elementos que soporta su red.
 */
export interface PublishInput {
  media: PublishMediaItem[];
  caption: string;
}

export type PublishResult =
  | { kind: "published"; externalId: string; permalink?: string }
  | { kind: "processing"; containerId: string } // solo IG video: falta pollear checkPublishStatus
  | { kind: "draft_sent"; externalId: string }; // solo TikTok: en el inbox del creador, falta que la persona lo termine de publicar

export interface RefreshedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

export interface ProviderConversation {
  externalId: string;
  /** PSID (Facebook) / IGSID (Instagram) del CLIENTE: es el `recipient_id` para responderle. */
  participantId: string;
  /** Facebook: nombre. Instagram: username (la API no da nombre). */
  participantName?: string;
  updatedAt?: string;
  /** Solo Facebook. */
  snippet?: string;
  unreadCount?: number;
  /** Solo Facebook: la red dice si la Página puede responder hoy. */
  canReply?: boolean;
  /** Solo Facebook: URL para abrir el hilo en la app/inbox de Meta. */
  link?: string;
}

export interface ConversationPage {
  conversations: ProviderConversation[];
  nextCursor?: string;
}

/**
 * Mensajes sin texto: la API devuelve `message` vacío y un campo aparte. `unsupported` = la
 * red no expone su contenido por API (audios, algunos stickers/reels...), NO se puede leer.
 */
export type ProviderMessageMedia = "attachment" | "share" | "story" | "unsupported";

export interface ProviderMessage {
  externalId: string;
  /** "out" = lo mandó el negocio; "in" = el cliente. */
  direction: "in" | "out";
  authorId?: string;
  text: string;
  media?: ProviderMessageMedia;
  sentAt: string;
}

export interface CommentActivityItem {
  externalId: string;
  /** Última modificación de la pieza según la red (Facebook la mueve cuando entra un comentario). */
  updatedAt?: string;
  /** Total de comentarios que reporta la red hoy. */
  commentCount?: number;
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
  /**
   * Presente cuando la cuenta tiene una conexión Composio activa y
   * linkeada (composio_connections.account_id) — ver
   * lib/platforms/composio-adapter.ts (Fase 2). Los providers *Composio
   * leen esto en vez de accessToken; accessToken/refreshToken se siguen
   * llenando siempre igual (la integración directa queda de fallback
   * por método: si el provider Composio no implementa algo —
   * fetchComments, postCommentReply, publishContent, todavía en Fase 3
   * — se usa el directo con esos mismos campos).
   */
  composio?: { userId: string; connectedAccountId: string };
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
  /**
   * Alcance/vistas de ESE día únicamente (no acumulable entre días — ver
   * audience_snapshot.reach). Solo Instagram lo llena hoy (Facebook ya
   * no tiene una métrica de reach a nivel de Página, Meta la deprecó;
   * TikTok no expone nada a nivel de cuenta más allá de
   * TIKTOK_GET_USER_STATS). Queda undefined en las redes que no lo tienen.
   */
  reachToday?: number;
  /**
   * Alcance único YA deduplicado de los últimos 7 días (metric_type=
   * total_value en Instagram) — es lo que alimenta el KPI "Alcance (7d)"
   * de Resumen. NUNCA se deriva sumando 7 `reachToday` (ver bug real
   * corregido en getInstagramAccountInsights).
   */
  reach7d?: number;
  /**
   * Interacciones/vistas de contenido de ESE día — a diferencia de
   * reach, esto SÍ es aditivo entre días (cada día son eventos nuevos,
   * no un conteo de cuentas únicas) — se puede sumar de forma segura
   * para el KPI de 7 días en vez de necesitar un total_value aparte.
   */
  interactionsToday?: number;
}
