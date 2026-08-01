import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform } from "@/types/db";
import { engagementRate, latestByContentId, latestByAccountId, followerSeriesByDay } from "./engagement";

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

async function getFilteredAccounts(supabase: DB, filters: OverviewFilters) {
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
    .select("id, author_name, text, commented_at, replied, content:content_id(id, thumbnail_url, permalink, caption, account_id)")
    .is("parent_comment_id", null)
    .eq("is_business_reply", false)
    .order("commented_at", { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string;
    author_name: string | null;
    text: string;
    commented_at: string | null;
    replied: boolean;
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
