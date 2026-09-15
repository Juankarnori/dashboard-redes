import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform, CommentSentiment } from "@/types/db";
import { engagementRate, latestByContentId, latestByAccountId, followerSeriesByDay, postsPerDay } from "./engagement";

const DAY_MS = 24 * 60 * 60 * 1000;

type DB = SupabaseClient<Database>;
type ContentRow = Database["public"]["Tables"]["content"]["Row"];
type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];

export interface OverviewFilters {
  brandId?: string;
  platform?: Platform;
}

export interface ContentWithLatestMetrics extends ContentRow {
  latestMetrics: ContentMetricsRow | null;
  // null = sin alcance/impresiones medibles (ver engagementRate en engagement.ts),
  // no "0% de engagement". Los agregados de abajo excluyen estos casos en vez de
  // promediarlos como si fueran un cero real.
  engagementRate: number | null;
}

export async function getFilteredAccounts(supabase: DB, filters: OverviewFilters) {
  let query = supabase.from("accounts").select("*, brands(name, color)").eq("status", "active");
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.platform) query = query.eq("platform", filters.platform);
  const { data } = await query;
  return data ?? [];
}

export async function getOverview(supabase: DB, filters: OverviewFilters) {
  const accounts = await getFilteredAccounts(supabase, filters);
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length === 0) {
    return {
      accounts: [],
      totalFollowers: 0,
      totalContent: 0,
      avgEngagementRate: 0,
      followerSeries: [] as { date: string; followers: number }[],
      platformComparison: [] as { platform: Platform; avgEngagementRate: number; contentCount: number }[],
      topContent: [] as (ContentWithLatestMetrics & { engagementRate: number })[],
    };
  }

  const [{ data: audienceRows }, { data: contentRows }] = await Promise.all([
    supabase
      .from("audience_snapshot")
      .select("*")
      .in("account_id", accountIds)
      .order("captured_at", { ascending: false }),
    supabase
      .from("content")
      .select("*, content_metrics(*)")
      .in("account_id", accountIds)
      .order("published_at", { ascending: false })
      .limit(300),
  ]);

  const latestAudience = latestByAccountId(audienceRows ?? []);
  const totalFollowers = Array.from(latestAudience.values()).reduce(
    (sum, a) => sum + (a.followers ?? 0),
    0
  );
  const followerSeries = followerSeriesByDay(audienceRows ?? []);

  const contentWithMetrics: ContentWithLatestMetrics[] = (contentRows ?? []).map((c) => {
    const metricsRows = (c as unknown as { content_metrics: ContentMetricsRow[] }).content_metrics ?? [];
    const latest = latestByContentId(
      metricsRows.map((m) => ({ ...m, content_id: c.id }))
    ).get(c.id);
    return {
      ...(c as ContentRow),
      latestMetrics: latest ?? null,
      engagementRate: latest ? engagementRate(latest) : null,
    };
  });

  const accountPlatformById = new Map(accounts.map((a) => [a.id, a.platform]));
  const byPlatform = new Map<Platform, { sum: number; count: number }>();
  for (const item of contentWithMetrics) {
    const platform = accountPlatformById.get(item.account_id);
    if (!platform || item.engagementRate === null) continue;
    const bucket = byPlatform.get(platform) ?? { sum: 0, count: 0 };
    bucket.sum += item.engagementRate;
    bucket.count += 1;
    byPlatform.set(platform, bucket);
  }
  const platformComparison = Array.from(byPlatform.entries()).map(([platform, { sum, count }]) => ({
    platform,
    avgEngagementRate: count > 0 ? sum / count : 0,
    contentCount: count,
  }));

  const withEngagement = contentWithMetrics.filter(
    (c): c is ContentWithLatestMetrics & { engagementRate: number } => c.engagementRate !== null
  );
  const avgEngagementRate =
    withEngagement.length > 0
      ? withEngagement.reduce((sum, c) => sum + c.engagementRate, 0) / withEngagement.length
      : 0;

  const topContent = [...withEngagement]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5);

  return {
    accounts,
    totalFollowers,
    totalContent: contentWithMetrics.length,
    avgEngagementRate,
    followerSeries,
    platformComparison,
    topContent,
  };
}

export async function getContentGallery(supabase: DB, filters: OverviewFilters) {
  const accounts = await getFilteredAccounts(supabase, filters);
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return [];

  const { data: contentRows } = await supabase
    .from("content")
    .select("*, content_metrics(*)")
    .in("account_id", accountIds)
    .order("published_at", { ascending: false })
    .limit(100);

  return (contentRows ?? []).map((c) => {
    const metricsRows = (c as unknown as { content_metrics: ContentMetricsRow[] }).content_metrics ?? [];
    const latest = latestByContentId(metricsRows.map((m) => ({ ...m, content_id: c.id }))).get(c.id);
    return {
      ...(c as ContentRow),
      latestMetrics: latest ?? null,
      engagementRate: latest ? engagementRate(latest) : null,
    } satisfies ContentWithLatestMetrics;
  });
}

/** Contenido + snapshot más reciente, en la forma que espera el motor de recomendaciones. */
export async function getContentForAnalysis(supabase: DB, accountIds: string[]) {
  if (accountIds.length === 0) return [];

  const { data: contentRows } = await supabase
    .from("content")
    .select("*, content_metrics(*)")
    .in("account_id", accountIds)
    .order("published_at", { ascending: false })
    .limit(300);

  return (contentRows ?? []).map((c) => {
    const metricsRows = (c as unknown as { content_metrics: ContentMetricsRow[] }).content_metrics ?? [];
    const latest = latestByContentId(metricsRows.map((m) => ({ ...m, content_id: c.id }))).get(c.id);
    return { content: c as ContentRow, latestMetrics: latest ?? null };
  });
}

/** Igual que getContentForAnalysis, pero acotado a un rango [start, end) de published_at — insumo del reporte semanal (Fase 4). */
export async function getContentForAnalysisInRange(
  supabase: DB,
  accountIds: string[],
  start: string,
  end: string
) {
  if (accountIds.length === 0) return [];

  const { data: contentRows } = await supabase
    .from("content")
    .select("*, content_metrics(*)")
    .in("account_id", accountIds)
    .gte("published_at", start)
    .lt("published_at", end)
    .order("published_at", { ascending: false });

  return (contentRows ?? []).map((c) => {
    const metricsRows = (c as unknown as { content_metrics: ContentMetricsRow[] }).content_metrics ?? [];
    const latest = latestByContentId(metricsRows.map((m) => ({ ...m, content_id: c.id }))).get(c.id);
    return { content: c as ContentRow, latestMetrics: latest ?? null };
  });
}

export interface UnansweredCommentStats {
  total: number;
  leads: number;
}

/** Comentarios de terceros sin responder (para el reporte semanal) — mismo filtro base que getCommentsInbox. */
export async function getUnansweredCommentStats(
  supabase: DB,
  accountIds: string[]
): Promise<UnansweredCommentStats> {
  if (accountIds.length === 0) return { total: 0, leads: 0 };

  const { data: contentRows } = await supabase.from("content").select("id").in("account_id", accountIds);
  const contentIds = (contentRows ?? []).map((c) => c.id);
  if (contentIds.length === 0) return { total: 0, leads: 0 };

  const { data, error } = await supabase
    .from("comments")
    .select("sentiment")
    .in("content_id", contentIds)
    .is("parent_comment_id", null)
    .eq("is_business_reply", false)
    .eq("replied", false);

  if (error || !data) return { total: 0, leads: 0 };
  return { total: data.length, leads: data.filter((c) => c.sentiment === "lead").length };
}

export interface AccountComparisonStat {
  accountId: string;
  label: string;
  platform: Platform;
  brand: { name: string; color: string } | null;
  avgEngagementRate: number | null; // null = sin contenido con métricas medibles todavía
  contentCount: number;
  followers: number | null;
}

export interface PlatformComparisonGroup {
  platform: Platform;
  accounts: AccountComparisonStat[];
}

/**
 * Comparativa lado a lado de las cuentas del dueño, agrupadas por red
 * (ej. las 2 cuentas de Instagram, las 2 de Facebook). Misma fórmula de
 * engagement que el resto del dashboard (`engagementRate` en
 * engagement.ts) — no inventa un cálculo nuevo.
 */
export async function getAccountComparison(
  supabase: DB,
  filters: OverviewFilters
): Promise<PlatformComparisonGroup[]> {
  const accounts = await getFilteredAccounts(supabase, filters);
  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);

  const [{ data: contentRows }, { data: audienceRows }] = await Promise.all([
    supabase
      .from("content")
      .select("account_id, content_metrics(*)")
      .in("account_id", accountIds)
      .order("published_at", { ascending: false })
      .limit(600),
    supabase
      .from("audience_snapshot")
      .select("*")
      .in("account_id", accountIds)
      .order("captured_at", { ascending: false }),
  ]);

  const latestAudience = latestByAccountId(audienceRows ?? []);

  const byAccount = new Map<string, { sum: number; count: number; total: number }>();
  for (const row of (contentRows ?? []) as unknown as {
    account_id: string;
    content_metrics: ContentMetricsRow[];
  }[]) {
    const bucket = byAccount.get(row.account_id) ?? { sum: 0, count: 0, total: 0 };
    bucket.total += 1;

    // Snapshot más reciente de esta pieza (por captured_at) — mismo criterio
    // que latestByContentId, aplicado acá directo porque no traemos el id
    // de content (no hace falta para el promedio por cuenta).
    const latestMetrics = row.content_metrics.reduce<ContentMetricsRow | null>((latest, m) => {
      if (!latest || new Date(m.captured_at) > new Date(latest.captured_at)) return m;
      return latest;
    }, null);

    const rate = latestMetrics ? engagementRate(latestMetrics) : null;
    if (rate !== null) {
      bucket.sum += rate;
      bucket.count += 1;
    }
    byAccount.set(row.account_id, bucket);
  }

  const stats: AccountComparisonStat[] = accounts.map((a) => {
    const bucket = byAccount.get(a.id);
    return {
      accountId: a.id,
      label: a.display_name ?? a.username ?? a.platform,
      platform: a.platform,
      brand: (a as unknown as { brands: { name: string; color: string } | null }).brands,
      avgEngagementRate: bucket && bucket.count > 0 ? bucket.sum / bucket.count : null,
      contentCount: bucket?.total ?? 0,
      followers: latestAudience.get(a.id)?.followers ?? null,
    };
  });

  const byPlatform = new Map<Platform, AccountComparisonStat[]>();
  for (const stat of stats) {
    const group = byPlatform.get(stat.platform) ?? [];
    group.push(stat);
    byPlatform.set(stat.platform, group);
  }

  return Array.from(byPlatform.entries())
    .map(([platform, groupAccounts]) => ({
      platform,
      accounts: groupAccounts.sort((a, b) => (b.avgEngagementRate ?? -1) - (a.avgEngagementRate ?? -1)),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

export interface AlertInputs {
  currentWeekMetrics: ContentMetricsRow[];
  previousWeekMetrics: ContentMetricsRow[];
  lastPublishedAt: string | null;
}

/** Insumos para las reglas de alertas (Fase 2) de una cuenta: métricas de las últimas 2 semanas + última fecha de publicación. */
export async function getAlertInputs(supabase: DB, accountId: string): Promise<AlertInputs> {
  const now = Date.now();
  const currentWindowStart = new Date(now - 7 * DAY_MS).toISOString();
  const previousWindowStart = new Date(now - 14 * DAY_MS).toISOString();

  const { data: contentRows } = await supabase
    .from("content")
    .select("id, published_at")
    .eq("account_id", accountId);

  const lastPublishedAt = (contentRows ?? []).reduce<string | null>((latest, c) => {
    if (!c.published_at) return latest;
    if (!latest || c.published_at > latest) return c.published_at;
    return latest;
  }, null);

  const contentIds = (contentRows ?? []).map((c) => c.id);
  if (contentIds.length === 0) {
    return { currentWeekMetrics: [], previousWeekMetrics: [], lastPublishedAt };
  }

  const { data: metricsRows } = await supabase
    .from("content_metrics")
    .select("*")
    .in("content_id", contentIds)
    .gte("captured_at", previousWindowStart);

  const rows = metricsRows ?? [];
  return {
    currentWeekMetrics: rows.filter((m) => m.captured_at >= currentWindowStart),
    previousWeekMetrics: rows.filter((m) => m.captured_at < currentWindowStart),
    lastPublishedAt,
  };
}

export type AlertWithAccount = Database["public"]["Tables"]["alerts"]["Row"] & {
  accounts: { display_name: string | null; username: string | null; platform: Platform } | null;
};

/** Alertas activas (ya filtradas por negocio/red) para la sección destacada del Resumen. */
export async function getActiveAlerts(supabase: DB, filters: OverviewFilters): Promise<AlertWithAccount[]> {
  const accounts = await getFilteredAccounts(supabase, filters);
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return [];

  const { data } = await supabase
    .from("alerts")
    .select("*, accounts(display_name, username, platform)")
    .in("account_id", accountIds)
    .order("detected_at", { ascending: false });

  const rows = (data ?? []) as unknown as AlertWithAccount[];
  // warning antes que info; Array.sort es estable, así que dentro de cada
  // severidad se conserva el orden por detected_at ya traído de la DB.
  return rows.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
}

export async function getContentDetail(supabase: DB, contentId: string) {
  const { data: content } = await supabase
    .from("content")
    .select("*, accounts(username, display_name, platform, brand_id, brands(name, color))")
    .eq("id", contentId)
    .maybeSingle();

  if (!content) return null;

  const { data: metricsHistory } = await supabase
    .from("content_metrics")
    .select("*")
    .eq("content_id", contentId)
    .order("captured_at", { ascending: true });

  return { content, metricsHistory: metricsHistory ?? [] };
}

/** Comentarios de una pieza, más viejo primero (para que el hilo se lea en orden). */
export async function getContentComments(supabase: DB, contentId: string) {
  const { data } = await supabase
    .from("comments")
    .select("*")
    .eq("content_id", contentId)
    .order("commented_at", { ascending: true });

  return data ?? [];
}

export interface CommentInboxItem {
  id: string;
  author_name: string | null;
  text: string;
  commented_at: string | null;
  replied: boolean;
  sentiment: CommentSentiment | null;
  intent_score: number;
  content: {
    id: string;
    thumbnail_url: string | null;
    permalink: string | null;
    caption: string | null;
  };
  platform: Platform;
  account_label: string;
  brand: { name: string; color: string } | null;
}

/**
 * Comentarios de terceros (sin nuestras propias respuestas, sin hijos de
 * hilo) de todas las cuentas que pasan `filters`, más reciente primero.
 * El split Pendientes/Todos (por `replied`) se hace en el cliente sobre
 * este mismo array — ver CommentInbox.tsx.
 */
export async function getCommentsInbox(supabase: DB, filters: OverviewFilters): Promise<CommentInboxItem[]> {
  const accounts = await getFilteredAccounts(supabase, filters);
  if (accounts.length === 0) return [];

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const { data } = await supabase
    .from("comments")
    .select(
      "id, author_name, text, commented_at, replied, sentiment, intent_score, content:content_id(id, thumbnail_url, permalink, caption, account_id)"
    )
    .is("parent_comment_id", null)
    .eq("is_business_reply", false)
    .order("commented_at", { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string;
    author_name: string | null;
    text: string;
    commented_at: string | null;
    replied: boolean;
    sentiment: CommentSentiment | null;
    intent_score: number;
    content: { id: string; thumbnail_url: string | null; permalink: string | null; caption: string | null; account_id: string };
  }[];

  const inbox: CommentInboxItem[] = [];
  for (const row of rows) {
    const account = accountById.get(row.content.account_id);
    if (!account) continue; // fuera del filtro de negocio/plataforma, o inactiva

    inbox.push({
      id: row.id,
      author_name: row.author_name,
      text: row.text,
      commented_at: row.commented_at,
      replied: row.replied,
      sentiment: row.sentiment,
      intent_score: row.intent_score,
      content: {
        id: row.content.id,
        thumbnail_url: row.content.thumbnail_url,
        permalink: row.content.permalink,
        caption: row.content.caption,
      },
      platform: account.platform,
      account_label: account.display_name ?? account.username ?? account.platform,
      brand: (account as unknown as { brands: { name: string; color: string } | null }).brands,
    });
  }

  return inbox;
}

export interface KpiTrends {
  followers: { current: number; series: number[] };
  posts7d: { current: number; series: number[] };
}

/**
 * Fase 2: series cortas para los sparklines de Resumen.
 *
 * A propósito NO incluye "Alcance 7d"/"Interacciones 7d" todavía:
 * sumar content_metrics.reach de varios posts NO da un alcance de
 * cuenta válido (cada fila es el alcance acumulado *de ese post*, no
 * un delta diario — es el mismo tipo de error que se acababa de
 * corregir para Instagram, ver getInstagramAccountInsights). Lo
 * correcto es lo que ya hace /settings/composio: pedirle a Meta el
 * total de cuenta ya deduplicado — pero eso todavía no se persiste en
 * ninguna tabla (audience_snapshot solo tiene followers/follows/
 * media_count). Antes de agregar esos dos KPIs hay que decidir si se
 * extiende audience_snapshot para guardarlos en el sync, o se leen en
 * vivo — ver conversación con el dueño.
 */
export async function getKpiTrends(supabase: DB, filters: OverviewFilters, days = 14): Promise<KpiTrends> {
  const accounts = await getFilteredAccounts(supabase, filters);
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) {
    return { followers: { current: 0, series: [] }, posts7d: { current: 0, series: [] } };
  }

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const [{ data: audienceRows }, { data: contentRows }] = await Promise.all([
    supabase
      .from("audience_snapshot")
      .select("account_id, captured_at, followers")
      .in("account_id", accountIds)
      .gte("captured_at", since)
      .order("captured_at", { ascending: true }),
    supabase.from("content").select("published_at").in("account_id", accountIds).gte("published_at", since),
  ]);

  const followerSeries = followerSeriesByDay(audienceRows ?? []);
  const perDay = postsPerDay(contentRows ?? [], days);
  const posts7d = perDay.slice(-7).reduce((sum, d) => sum + d.count, 0);

  return {
    followers: {
      current: followerSeries.at(-1)?.followers ?? 0,
      series: followerSeries.map((d) => d.followers),
    },
    posts7d: {
      current: posts7d,
      series: perDay.map((d) => d.count),
    },
  };
}

export interface AttentionSummary {
  unrepliedComments: number;
  hotLeads: number;
  pendingDrafts: number;
}

/**
 * Fase 2: bloque "Necesita tu atención" del Resumen — reusa
 * getCommentsInbox (ya trae comentarios de terceros sin nuestras
 * respuestas) en vez de repetir esa consulta.
 */
export async function getAttentionSummary(supabase: DB, filters: OverviewFilters): Promise<AttentionSummary> {
  const [inbox, draftsResult] = await Promise.all([
    getCommentsInbox(supabase, filters),
    (() => {
      let query = supabase.from("content_calendar").select("id", { count: "exact", head: true }).eq("status", "planned");
      if (filters.brandId) query = query.eq("brand_id", filters.brandId);
      if (filters.platform) query = query.eq("platform", filters.platform);
      return query;
    })(),
  ]);

  const pending = inbox.filter((c) => !c.replied);
  return {
    unrepliedComments: pending.length,
    hotLeads: pending.filter((c) => c.sentiment === "lead").length,
    pendingDrafts: draftsResult.count ?? 0,
  };
}
