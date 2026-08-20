import { engagementRate } from "./engagement";
import { bestPostingTimes, formatComparison, topPerformers, type ContentForAnalysis } from "./recommendations";
import type { ContentType, Database } from "@/types/db";

type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];

const TYPE_LABELS: Record<ContentType, string> = {
  post: "imagen",
  carousel: "carrusel",
  reel: "reel",
  story: "historia",
  video: "video",
};

function reachOf(m: ContentMetricsRow | null): number {
  if (!m) return 0;
  return m.reach ?? m.impressions ?? 0;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

/** Lunes a las 00:00 más reciente que sea estrictamente anterior a `date`. */
function mostRecentMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export interface ReportWeek {
  weekStart: Date;
  weekEnd: Date; // exclusivo
  previousWeekStart: Date;
  previousWeekEnd: Date; // exclusivo
}

/**
 * La "semana del reporte" es la última semana completa (lunes a domingo)
 * antes de `now` — pensado para un cron que corre el lunes a la mañana:
 * resume la semana que acaba de terminar, no la que recién empieza.
 */
export function computeReportWeek(now: Date = new Date()): ReportWeek {
  const thisMonday = mostRecentMonday(now);
  const weekEnd = thisMonday;
  const weekStart = addDays(thisMonday, -7);
  return {
    weekStart,
    weekEnd,
    previousWeekStart: addDays(weekStart, -7),
    previousWeekEnd: weekStart,
  };
}

export interface WeeklyReportInput {
  brandName: string;
  weekStart: Date;
  weekEnd: Date; // exclusivo — el último día real del reporte es weekEnd - 1 día
  currentWeekContent: ContentForAnalysis[];
  previousWeekContent: ContentForAnalysis[];
  unansweredComments: number;
  unansweredLeads: number;
}

export interface WeeklyReportResult {
  body: string;
  metrics: Record<string, unknown>;
}

/**
 * Arma el reporte semanal como texto con plantillas de string — sin LLM,
 * solo interpolación sobre datos ya calculados con las mismas funciones
 * que usan Resumen/Recomendaciones/Alertas (topPerformers,
 * formatComparison, bestPostingTimes, engagementRate).
 */
export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReportResult {
  const {
    brandName,
    weekStart,
    weekEnd,
    currentWeekContent,
    previousWeekContent,
    unansweredComments,
    unansweredLeads,
  } = input;

  const n = currentWeekContent.length;
  const totalReach = currentWeekContent.reduce((sum, i) => sum + reachOf(i.latestMetrics), 0);
  const previousTotalReach = previousWeekContent.reduce((sum, i) => sum + reachOf(i.latestMetrics), 0);
  const reachChangePct = previousTotalReach > 0 ? (totalReach - previousTotalReach) / previousTotalReach : null;

  const best = topPerformers(currentWeekContent, 1)[0] ?? null;
  const bestRate = best?.latestMetrics ? engagementRate(best.latestMetrics) : null;
  const formatWinner = formatComparison(currentWeekContent)[0] ?? null;
  // minSamples=1: una sola semana da poca muestra por franja horaria —
  // acá es una descripción de lo que pasó, no una recomendación a futuro
  // (para eso está /recommendations, que sí exige minSamples más alto).
  const bestTime = bestPostingTimes(currentWeekContent, 1)[0] ?? null;

  const lastDay = addDays(weekEnd, -1);
  const parts: string[] = [
    `Del ${fmtDate(weekStart)} al ${fmtDate(lastDay)}: publicaste ${n} pieza${n === 1 ? "" : "s"}.`,
  ];

  if (n === 0) {
    parts.push("No hubo contenido nuevo esta semana.");
  } else {
    const reachChangeText =
      reachChangePct !== null
        ? ` (${reachChangePct >= 0 ? "+" : ""}${(reachChangePct * 100).toFixed(0)}% vs. semana previa)`
        : "";
    parts.push(`Alcance total ${totalReach.toLocaleString("es")}${reachChangeText}.`);

    if (best && bestRate !== null) {
      const caption = best.content.caption?.trim();
      parts.push(
        `Mejor post: "${caption ? caption.slice(0, 80) : "(sin descripción)"}" (${pct(bestRate)} engagement).`
      );
    }
    if (formatWinner) {
      parts.push(`Formato ganador: ${TYPE_LABELS[formatWinner.type] ?? formatWinner.type}.`);
    }
    if (bestTime) {
      parts.push(`Mejor hora: ${bestTime.dayLabel} ${bestTime.hour}:00.`);
    }
  }

  parts.push(
    `Comentarios sin responder: ${unansweredComments}${unansweredLeads > 0 ? ` (leads: ${unansweredLeads})` : ""}.`
  );

  return {
    body: `${brandName} — ${parts.join(" ")}`,
    metrics: {
      contentCount: n,
      totalReach,
      previousTotalReach,
      reachChangePct,
      bestPostContentId: best?.content.id ?? null,
      bestPostCaption: best?.content.caption ?? null,
      bestPostEngagementRate: bestRate,
      formatWinner: formatWinner?.type ?? null,
      bestDay: bestTime?.dayLabel ?? null,
      bestHour: bestTime?.hour ?? null,
      unansweredComments,
      unansweredLeads,
    },
  };
}
