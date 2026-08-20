/**
 * Clasificación de comentarios por reglas (léxicos en español) — sin IA,
 * sin llamadas de red. Función pura: texto → {sentiment, score}. Se corre
 * en CPU al final del scope=comments de /api/sync (ver `comments-sync.ts`),
 * así prioriza leads/quejas sin costar nada.
 *
 * Los léxicos son constantes exportadas a propósito: son la parte más
 * fácil de ajustar sin tocar la lógica si en el futuro aparecen palabras
 * nuevas que valga la pena sumar.
 */

import type { CommentSentiment } from "@/types/db";

export type { CommentSentiment };

export interface ClassificationResult {
  sentiment: CommentSentiment;
  /** 0-100. Densidad de señales de la categoría asignada (más alto = más confianza/urgencia). */
  score: number;
}

export const LEAD_KEYWORDS = [
  "precio",
  "cuanto",
  "cuesta",
  "vale",
  "comprar",
  "disponible",
  "stock",
  "hay",
  "envio",
  "delivery",
  "cotiza",
  "cotizacion",
  "info",
  "interesa",
  "quiero",
  "pedido",
  "wsp",
  "whatsapp",
  "dm",
  "numero",
  "contacto",
];

export const NEGATIVE_KEYWORDS = [
  "malo",
  "pesimo",
  "estafa",
  "no sirve",
  "horrible",
  "decepcion",
  "tarde",
  "no llego",
  "reembolso",
];

export const NEGATIVE_EMOJIS = ["😡", "👎", "💔", "😠", "🤬"];

export const POSITIVE_KEYWORDS = ["me encanta", "hermoso", "excelente", "gracias"];

export const POSITIVE_EMOJIS = ["🔥", "❤️", "👏", "😍", "✨"];

export const SPAM_KEYWORDS = ["sigueme", "followback", "gana dinero", "follow4follow", "f4f"];

export const QUESTION_STARTERS = ["que", "como", "cuando", "cuanto", "donde", "cual", "quien"];

const URL_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(ly|co|shop|store|link|click|xyz)\b/i;

/** Un mismo carácter repetido 5+ veces seguidas (típico de spam/ruido: "!!!!!!", "jajajaja..."). */
const REPEATED_CHARS_RE = /(.)\1{4,}/;

/** Minúsculas + sin acentos, para que los léxicos no dupliquen cada variante con/sin tilde. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function countMatches(normalized: string, keywords: string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = /^[a-z0-9]/.test(keyword) && /[a-z0-9]$/.test(keyword) ? "\\b" : "";
    const re = new RegExp(`${boundary}${escaped}${boundary}`, "i");
    if (re.test(normalized)) count++;
  }
  return count;
}

function densityScore(matches: number, bonus = 0): number {
  return Math.min(100, matches * 25 + bonus);
}

/**
 * Clasifica un comentario en una única categoría. Precedencia cuando hay
 * señales de varias categorías a la vez (spam > negative > lead > question
 * > positive > neutral):
 * - spam primero: un link o "sígueme" no es una venta real, es ruido.
 * - negative antes que lead: palabras de queja fuerte ("estafa", "no
 *   llegó") pesan más que una palabra comercial genérica que puede
 *   aparecer igual en una queja (ej. "estafa, nunca llegó mi pedido" —
 *   "pedido" es señal de lead, pero el comentario es una queja).
 * - lead antes que question: una pregunta con palabra comercial
 *   ("¿cuánto cuesta?") es una oportunidad de venta, no una pregunta genérica.
 */
export function classifyComment(text: string): ClassificationResult {
  const trimmed = text.trim();
  const normalized = normalize(trimmed);
  const hasQuestionMark = trimmed.includes("?");

  const spamKeywordMatches = countMatches(normalized, SPAM_KEYWORDS);
  const hasUrl = URL_RE.test(trimmed);
  const hasRepeatedChars = REPEATED_CHARS_RE.test(trimmed);
  if (spamKeywordMatches > 0 || hasUrl || hasRepeatedChars) {
    const matches = spamKeywordMatches + (hasUrl ? 1 : 0) + (hasRepeatedChars ? 1 : 0);
    return { sentiment: "spam", score: densityScore(matches) };
  }

  const negativeKeywordMatches = countMatches(normalized, NEGATIVE_KEYWORDS);
  const negativeEmojiMatches = NEGATIVE_EMOJIS.filter((e) => trimmed.includes(e)).length;
  if (negativeKeywordMatches > 0 || negativeEmojiMatches > 0) {
    return { sentiment: "negative", score: densityScore(negativeKeywordMatches + negativeEmojiMatches) };
  }

  // Regla "'?' junto a una palabra comercial" ya queda cubierta acá: un
  // signo de pregunta no dispara "lead" por sí solo, pero sube el score
  // cuando además hay una palabra comercial (leadMatches > 0).
  const leadMatches = countMatches(normalized, LEAD_KEYWORDS);
  if (leadMatches > 0) {
    return { sentiment: "lead", score: densityScore(leadMatches, hasQuestionMark ? 20 : 0) };
  }

  const startsWithQuestionWord = QUESTION_STARTERS.some((w) => new RegExp(`^¿?${w}\\b`, "i").test(normalized));
  if (hasQuestionMark || startsWithQuestionWord) {
    return { sentiment: "question", score: densityScore(1) };
  }

  const positiveKeywordMatches = countMatches(normalized, POSITIVE_KEYWORDS);
  const positiveEmojiMatches = POSITIVE_EMOJIS.filter((e) => trimmed.includes(e)).length;
  if (positiveKeywordMatches > 0 || positiveEmojiMatches > 0) {
    return { sentiment: "positive", score: densityScore(positiveKeywordMatches + positiveEmojiMatches) };
  }

  return { sentiment: "neutral", score: 0 };
}
