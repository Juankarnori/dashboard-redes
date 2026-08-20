import type { SupabaseClient } from "@supabase/supabase-js";
import { engagementRate, latestByContentId } from "./engagement";
import { getAlertInputs, getContentForAnalysis } from "./queries";
import type { Database, AlertSeverity } from "@/types/db";

type DB = SupabaseClient<Database>;
type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];
type AlertInsert = Database["public"]["Tables"]["alerts"]["Insert"];

// Umbrales acordados para la Fase 2 — ajustar acá si hace falta afinarlos.
const ENGAGEMENT_DROP_INFO = 0.2; // 20%
const ENGAGEMENT_DROP_WARNING = 0.4; // 40%
const NO_POSTS_INFO_DAYS = 3;
const NO_POSTS_WARNING_DAYS = 7;

// Umbrales Fase 3 — despegue (content_spike) y caída de alcance (reach_drop).
const SPIKE_WINDOW_DAYS = 30; // N: ventana de contenido "reciente" de la cuenta
const SPIKE_STD_DEV_MULTIPLIER = 2; // k: cuántos desvíos por encima de la media para "despegar"
const SPIKE_MIN_SAMPLES = 5; // mínimo de piezas en la ventana para que media/desvío tengan sentido
const REACH_DROP_WINDOW_POSTS = 5; // X: cuántos posts recientes se promedian
const REACH_DROP_INFO_PCT = 0.6; // Y: cae por debajo del 60% del promedio anterior → info
const REACH_DROP_WARNING_PCT = 0.4; // cae por debajo del 40% → warning

function average(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[], mean: number): number {
  return Math.sqrt(average(nums.map((n) => (n - mean) ** 2)));
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

export interface ContentSpikeCandidate {
  contentId: string;
  caption: string | null;
  publishedAt: string;
  rate: number;
}

export interface ContentSpikeResult extends ContentSpikeCandidate {
  meanRate: number;
  stdDevRate: number;
  threshold: number;
}

/**
 * Contenido que "despega": su engagement rate supera la media + k·desvío
 * estándar del resto de la cuenta en una ventana de N días (k≈2, ver
 * SPIKE_STD_DEV_MULTIPLIER). Usa engagementRate (no alcance crudo) porque
 * es la métrica ya normalizada que se compara en todo el dashboard — un
 * alcance más alto no siempre es "despegando", pero un engagement rate
 * muy por encima de lo normal de la cuenta sí es señal de que conviene
 * empujarlo con anuncio.
 */
export function detectContentSpikes(
  items: ContentSpikeCandidate[],
  now: Date = new Date()
): ContentSpikeResult[] {
  const cutoff = now.getTime() - SPIKE_WINDOW_DAYS * 86_400_000;
  const windowItems = items.filter((i) => new Date(i.publishedAt).getTime() >= cutoff);
  if (windowItems.length < SPIKE_MIN_SAMPLES) return [];

  const rates = windowItems.map((i) => i.rate);
  const meanRate = average(rates);
  const stdDevRate = stdDev(rates, meanRate);
  if (stdDevRate === 0) return []; // todo el mundo con el mismo rate — no hay "despegue" relativo

  const threshold = meanRate + SPIKE_STD_DEV_MULTIPLIER * stdDevRate;

  return windowItems
    .filter((i) => i.rate > threshold)
    .map((i) => ({ ...i, meanRate, stdDevRate, threshold }));
}

export interface ReachDropResult {
  currentAvgReach: number;
  previousAvgReach: number;
  ratio: number; // currentAvgReach / previousAvgReach
  severity: AlertSeverity;
}

/**
 * Caída de alcance: promedio de los últimos X posts (REACH_DROP_WINDOW_POSTS)
 * vs. el promedio de los X posts anteriores a esos. A diferencia de
 * detectEngagementDrop (engagement rate, ventana calendario semanal),
 * esta usa alcance crudo y ventana por cantidad de posts — reacciona más
 * rápido a una caída reciente sin esperar a que pase una semana completa.
 */
export function detectReachDrop(
  items: { publishedAt: string | null; reach: number | null }[]
): ReachDropResult | null {
  const sorted = items
    .filter((i): i is { publishedAt: string; reach: number } => !!i.publishedAt && !!i.reach && i.reach > 0)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (sorted.length < REACH_DROP_WINDOW_POSTS * 2) return null; // no hay suficiente historial para comparar

  const recent = sorted.slice(0, REACH_DROP_WINDOW_POSTS).map((i) => i.reach);
  const previous = sorted.slice(REACH_DROP_WINDOW_POSTS, REACH_DROP_WINDOW_POSTS * 2).map((i) => i.reach);

  const currentAvgReach = average(recent);
  const previousAvgReach = average(previous);
  if (previousAvgReach <= 0) return null;

  const ratio = currentAvgReach / previousAvgReach;
  if (ratio >= REACH_DROP_INFO_PCT) return null;

  return {
    currentAvgReach,
    previousAvgReach,
    ratio,
    severity: ratio < REACH_DROP_WARNING_PCT ? "warning" : "info",
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

  // Insumos de Fase 3 (despegue + caída de alcance): reusa
  // getContentForAnalysis, la misma fuente que recommendations.ts, en vez
  // de armar otra query de content+metrics.
  const items = await getContentForAnalysis(supabase, [account.id]);

  const spikeCandidates: ContentSpikeCandidate[] = items
    .filter((i) => i.content.published_at && i.latestMetrics)
    .map((i) => ({
      contentId: i.content.id,
      caption: i.content.caption,
      publishedAt: i.content.published_at as string,
      rate: i.latestMetrics ? engagementRate(i.latestMetrics) : null,
    }))
    .filter((i): i is ContentSpikeCandidate => i.rate !== null);

  for (const spike of detectContentSpikes(spikeCandidates)) {
    rows.push({
      brand_id: account.brand_id,
      account_id: account.id,
      content_id: spike.contentId,
      type: "content_spike",
      severity: "info",
      title: "Contenido despegando",
      body: `${account.label}: "${(spike.caption ?? "").slice(0, 60) || "(sin descripción)"}" tiene ${(spike.rate * 100).toFixed(1)}% de engagement, muy por encima del promedio de la cuenta (${(spike.meanRate * 100).toFixed(1)}%). Considéralo para anuncio.`,
      data: { rate: spike.rate, meanRate: spike.meanRate, stdDevRate: spike.stdDevRate, threshold: spike.threshold },
    });
  }

  const reachItems = items.map((i) => ({
    publishedAt: i.content.published_at,
    reach: i.latestMetrics?.reach ?? null,
  }));
  const reachDrop = detectReachDrop(reachItems);
  if (reachDrop) {
    rows.push({
      brand_id: account.brand_id,
      account_id: account.id,
      type: "reach_drop",
      severity: reachDrop.severity,
      title: `Alcance cayó a ${(reachDrop.ratio * 100).toFixed(0)}% del promedio anterior`,
      body: `${account.label}: los últimos ${REACH_DROP_WINDOW_POSTS} posts promedian ${Math.round(reachDrop.currentAvgReach).toLocaleString("es")} de alcance, vs. ${Math.round(reachDrop.previousAvgReach).toLocaleString("es")} de los ${REACH_DROP_WINDOW_POSTS} anteriores.`,
      data: {
        currentAvgReach: reachDrop.currentAvgReach,
        previousAvgReach: reachDrop.previousAvgReach,
        ratio: reachDrop.ratio,
      },
    });
  }

  await supabase.from("alerts").delete().eq("account_id", account.id);
  if (rows.length > 0) {
    await supabase.from("alerts").insert(rows);
  }
}
