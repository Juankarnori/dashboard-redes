import { engagementRate } from "./engagement";
import type { Database, ContentType } from "@/types/db";

type ContentRow = Database["public"]["Tables"]["content"]["Row"];
type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];

export interface ContentForAnalysis {
  content: ContentRow;
  latestMetrics: ContentMetricsRow | null;
}

const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export interface BestTimeSlot {
  dayOfWeek: number;
  dayLabel: string;
  hour: number;
  avgEngagementRate: number;
  sampleSize: number;
}

/**
 * Mejor horario de publicación: agrupa por día de la semana + hora local
 * de `published_at` y promedia el engagement rate del snapshot más
 * reciente de cada pieza. Requiere al menos `minSamples` piezas por
 * franja para no recomendar en base a un solo post con suerte.
 */
export function bestPostingTimes(
  items: ContentForAnalysis[],
  minSamples = 2
): BestTimeSlot[] {
  const buckets = new Map<string, { sum: number; count: number; dayOfWeek: number; hour: number }>();

  for (const { content, latestMetrics } of items) {
    if (!content.published_at || !latestMetrics) continue;
    const rate = engagementRate(latestMetrics);
    if (rate === null) continue; // sin alcance/impresiones medibles — no cuenta en el promedio
    const date = new Date(content.published_at);
    const key = `${date.getDay()}:${date.getHours()}`;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0, dayOfWeek: date.getDay(), hour: date.getHours() };
    bucket.sum += rate;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .filter((b) => b.count >= minSamples)
    .map((b) => ({
      dayOfWeek: b.dayOfWeek,
      dayLabel: DAY_LABELS[b.dayOfWeek],
      hour: b.hour,
      avgEngagementRate: b.sum / b.count,
      sampleSize: b.count,
    }))
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
}

export interface FormatStats {
  type: ContentType;
  avgEngagementRate: number;
  sampleSize: number;
}

/** Compara engagement promedio entre posts, reels e historias. */
export function formatComparison(items: ContentForAnalysis[]): FormatStats[] {
  const buckets = new Map<ContentType, { sum: number; count: number }>();

  for (const { content, latestMetrics } of items) {
    if (!latestMetrics) continue;
    const rate = engagementRate(latestMetrics);
    if (rate === null) continue; // sin alcance/impresiones medibles — no cuenta en el promedio
    const bucket = buckets.get(content.type) ?? { sum: 0, count: 0 };
    bucket.sum += rate;
    bucket.count += 1;
    buckets.set(content.type, bucket);
  }

  return Array.from(buckets.entries())
    .map(([type, { sum, count }]) => ({ type, avgEngagementRate: sum / count, sampleSize: count }))
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
}

/** Top N piezas por engagement — insumo para el prompt de Claude (Fase 4). */
export function topPerformers(items: ContentForAnalysis[], limit = 8): ContentForAnalysis[] {
  return items
    .map((item) => ({
      item,
      rate: item.latestMetrics ? engagementRate(item.latestMetrics) : null,
    }))
    .filter((x): x is { item: ContentForAnalysis; rate: number } => x.rate !== null)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit)
    .map((x) => x.item);
}
