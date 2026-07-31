import type { Database } from "@/types/db";

type ContentMetricsRow = Database["public"]["Tables"]["content_metrics"]["Row"];

/**
 * Tasa de engagement de un snapshot de métricas: interacciones sobre
 * alcance (o impresiones si no hay alcance disponible). 0–1, no en %.
 *
 * Devuelve `null` cuando no hay alcance ni impresiones (ej. cuentas de
 * Instagram con menos de 1,000 seguidores, donde Meta no expone esas
 * métricas — ver lib/meta/instagram.ts) — es "sin dato medible", no un
 * engagement real de 0%. Tratarlo como 0 promedia mal: una pieza sin
 * alcance arrastraría el promedio del grupo hacia 0 aunque el resto de
 * las piezas sí tengan datos reales.
 */
export function engagementRate(m: Pick<
  ContentMetricsRow,
  "likes" | "comments" | "shares" | "saves" | "reach" | "impressions"
>): number | null {
  const base = m.reach ?? m.impressions ?? 0;
  if (base <= 0) return null;
  const interactions = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  return interactions / base;
}

/** Reduce una lista de snapshots (varios content) al más reciente por content_id. */
export function latestByContentId<T extends { content_id: string; captured_at: string }>(
  rows: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.content_id);
    if (!current || new Date(row.captured_at) > new Date(current.captured_at)) {
      map.set(row.content_id, row);
    }
  }
  return map;
}

/** Reduce una lista de audience_snapshot al más reciente por account_id. */
export function latestByAccountId<T extends { account_id: string; captured_at: string }>(
  rows: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const current = map.get(row.account_id);
    if (!current || new Date(row.captured_at) > new Date(current.captured_at)) {
      map.set(row.account_id, row);
    }
  }
  return map;
}

/** Agrupa snapshots de audiencia por día (YYYY-MM-DD), sumando el último valor de cada cuenta ese día. */
export function followerSeriesByDay(
  rows: { account_id: string; captured_at: string; followers: number | null }[]
): { date: string; followers: number }[] {
  // último snapshot por (cuenta, día)
  const perAccountPerDay = new Map<string, { captured_at: string; followers: number | null }>();
  for (const row of rows) {
    const day = row.captured_at.slice(0, 10);
    const key = `${row.account_id}:${day}`;
    const current = perAccountPerDay.get(key);
    if (!current || new Date(row.captured_at) > new Date(current.captured_at)) {
      perAccountPerDay.set(key, row);
    }
  }

  const totalsByDay = new Map<string, number>();
  for (const [key, row] of perAccountPerDay) {
    const day = key.split(":")[1];
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + (row.followers ?? 0));
  }

  return Array.from(totalsByDay.entries())
    .map(([date, followers]) => ({ date, followers }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
