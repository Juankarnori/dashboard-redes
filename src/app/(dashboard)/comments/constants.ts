import type { CommentSentiment } from "@/types/db";

export const SENTIMENT_LABELS: Record<CommentSentiment, string> = {
  lead: "Lead",
  negative: "Negativo",
  question: "Pregunta",
  spam: "Spam",
  positive: "Positivo",
  neutral: "Neutral",
};

/** Clases de badge por sentimiento — reutiliza los tokens de color del theme (globals.css). */
export const SENTIMENT_BADGE_CLASSES: Record<CommentSentiment, string> = {
  lead: "border-accent/30 bg-accent-soft text-accent-strong",
  negative: "border-negative/30 bg-negative-soft text-negative",
  question: "border-border bg-surface-2 text-ink-600",
  spam: "border-border bg-surface-2 text-ink-400",
  positive: "border-positive/30 bg-positive-soft text-positive",
  neutral: "border-border bg-surface-2 text-ink-400",
};

/**
 * Prioridad de la bandeja: leads primero (venta), después quejas
 * (retención), el resto en el orden que ya viene (más reciente primero).
 * Usado por CommentInbox para un sort estable sobre `commented_at desc`.
 */
export const SENTIMENT_PRIORITY: Record<CommentSentiment, number> = {
  lead: 0,
  negative: 1,
  question: 2,
  positive: 3,
  neutral: 4,
  spam: 5,
};

export const SENTIMENT_FILTERS: { value: CommentSentiment | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "lead", label: "Leads" },
  { value: "negative", label: "Negativos" },
  { value: "question", label: "Preguntas" },
  { value: "positive", label: "Positivos" },
  { value: "spam", label: "Spam" },
  { value: "neutral", label: "Neutrales" },
];
