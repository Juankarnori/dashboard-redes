import type { SupabaseClient } from "@supabase/supabase-js";
import { engagementRate, latestByContentId } from "./engagement";
import { getAlertInputs } from "./queries";
import type { Database, AlertSeverity } from "@/types/db";

type DB = SupabaseClient<Database>;
type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];
type AlertInsert = Database["public"]["Tables"]["alerts"]["Insert"];

// Umbrales acordados para la Fase 2 — ajustar acá si hace falta afinarlos.
const ENGAGEMENT_DROP_INFO = 0.2; // 20%
const ENGAGEMENT_DROP_WARNING = 0.4; // 40%
const NO_POSTS_INFO_DAYS = 3;
const NO_POSTS_WARNING_DAYS = 7;

function average(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

export interface EngagementDropResult {
  currentAvgRate: number;
  previousAvgRate: number;
  dropRatio: number;
  severity: AlertSeverity;
}

/**
 * Compara el engagement rate promedio de la última semana vs. la
 * anterior (última métrica de cada pieza dentro de cada ventana, para no
 * pesar de más el contenido resincronizado varias veces en la semana).
 * null si no hay datos suficientes en alguna de las dos ventanas.
 */
export function detectEngagementDrop(
  currentWeekMetrics: ContentMetricsRow[],
  previousWeekMetrics: ContentMetricsRow[]
): EngagementDropResult | null {
  if (currentWeekMetrics.length === 0 || previousWeekMetrics.length === 0) return null;

  const currentRates = Array.from(latestByContentId(currentWeekMetrics).values())
    .map(engagementRate)
    .filter((r): r is number => r !== null);
  const previousRates = Array.from(latestByContentId(previousWeekMetrics).values())
    .map(engagementRate)
    .filter((r): r is number => r !== null);

  // Sin alcance/impresiones medibles en alguna ventana (ej. cuenta con
  // <1,000 seguidores en Instagram) — no hay base real para comparar.
  if (currentRates.length === 0 || previousRates.length === 0) return null;

  const currentAvgRate = average(currentRates);
  const previousAvgRate = average(previousRates);
  if (previousAvgRate <= 0) return null;

  const dropRatio = (previousAvgRate - currentAvgRate) / previousAvgRate;
  if (dropRatio < ENGAGEMENT_DROP_INFO) return null;

  return {
    currentAvgRate,
    previousAvgRate,
    dropRatio,
    severity: dropRatio >= ENGAGEMENT_DROP_WARNING ? "warning" : "info",
  };
}

export interface NoPostsStreakResult {
  daysSinceLastPost: number;
  severity: AlertSeverity;
}

/** null si nunca publicó nada (cuenta recién conectada) o si el corte no llegó al umbral. */
export function detectNoPostsStreak(
  lastPublishedAt: string | null,
  now: Date = new Date()
): NoPostsStreakResult | null {
  if (!lastPublishedAt) return null;
  const daysSinceLastPost = Math.floor((now.getTime() - new Date(lastPublishedAt).getTime()) / 86_400_000);
  if (daysSinceLastPost < NO_POSTS_INFO_DAYS) return null;

  return {
    daysSinceLastPost,
    severity: daysSinceLastPost >= NO_POSTS_WARNING_DAYS ? "warning" : "info",
  };
}

export interface AlertAccountInfo {
  id: string;
  brand_id: string;
  label: string;
}

/**
 * Recalcula las alertas de una cuenta y reemplaza las anteriores
 * (delete-and-reinsert: "activa" = existe ahora mismo, sin campo de
 * estado). Pensado para llamarse al final de un sync completo (scope=all).
 */
export async function recomputeAccountAlerts(supabase: DB, account: AlertAccountInfo): Promise<void> {
  const { currentWeekMetrics, previousWeekMetrics, lastPublishedAt } = await getAlertInputs(supabase, account.id);

  const rows: AlertInsert[] = [];

  const drop = detectEngagementDrop(currentWeekMetrics, previousWeekMetrics);
  if (drop) {
    rows.push({
      brand_id: account.brand_id,
      account_id: account.id,
      type: "engagement_drop",
      severity: drop.severity,
      title: `Engagement bajó ${(drop.dropRatio * 100).toFixed(0)}%`,
      body: `${account.label}: ${(drop.previousAvgRate * 100).toFixed(1)}% → ${(drop.currentAvgRate * 100).toFixed(1)}% de engagement promedio vs. la semana anterior.`,
      data: {
        currentAvgRate: drop.currentAvgRate,
        previousAvgRate: drop.previousAvgRate,
        dropRatio: drop.dropRatio,
      },
    });
  }

  const streak = detectNoPostsStreak(lastPublishedAt);
  if (streak) {
    rows.push({
      brand_id: account.brand_id,
      account_id: account.id,
      type: "no_posts_streak",
      severity: streak.severity,
      title: `${streak.daysSinceLastPost} días sin publicar`,
      body: `${account.label} no tiene contenido nuevo desde hace ${streak.daysSinceLastPost} días.`,
      data: { daysSinceLastPost: streak.daysSinceLastPost },
    });
  }

  await supabase.from("alerts").delete().eq("account_id", account.id);
  if (rows.length > 0) {
    await supabase.from("alerts").insert(rows);
  }
}
