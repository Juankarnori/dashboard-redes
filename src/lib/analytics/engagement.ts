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

/**
 * Agrupa snapshots de audiencia por día (YYYY-MM-DD), sumando el último
 * valor de cada cuenta ese día. Genérico sobre qué campo numérico sumar
 * (followers, reach, interactions...) — sumar ACROSS CUENTAS el mismo
 * día es válido siempre (audiencias distintas, no hay doble conteo);
 * lo que nunca hay que hacer es sumar el mismo campo ACROSS DÍAS de
 * `reach` (ver reach_7d en la migración 0017) — esta función no hace
 * eso, solo arma la serie día a día tal cual, cada punto es independiente.
 */
export function metricSeriesByDay<K extends string>(
  rows: ({ account_id: string; captured_at: string } & Record<K, number | null>)[],
  key: K
): { date: string; value: number }[] {
  const perAccountPerDay = new Map<string, { captured_at: string; value: number | null }>();
  for (const row of rows) {
    const day = row.captured_at.slice(0, 10);
    const mapKey = `${row.account_id}:${day}`;
    const current = perAccountPerDay.get(mapKey);
    if (!current || new Date(row.captured_at) > new Date(current.captured_at)) {
      perAccountPerDay.set(mapKey, { captured_at: row.captured_at, value: row[key] });
    }
  }

  const totalsByDay = new Map<string, number>();
  for (const [mapKey, row] of perAccountPerDay) {
    const day = mapKey.split(":")[1];
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + (row.value ?? 0));
  }

  return Array.from(totalsByDay.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Agrupa snapshots de audiencia por día (YYYY-MM-DD), sumando el último valor de cada cuenta ese día. */
export function followerSeriesByDay(
  rows: { account_id: string; captured_at: string; followers: number | null }[]
): { date: string; followers: number }[] {
  return metricSeriesByDay(rows, "followers").map(({ date, value }) => ({ date, followers: value }));
}

/** Los últimos `days` días como YYYY-MM-DD (hoy incluido), en orden ascendente — para series densas con ceros donde no hay dato. */
export function lastNDays(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Cuenta piezas por día de publicación (YYYY-MM-DD), densificado sobre `days` — 0 en los días sin publicaciones. */
export function postsPerDay(
  rows: { published_at: string | null }[],
  days: number
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.published_at) continue;
    const day = row.published_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return lastNDays(days).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}
