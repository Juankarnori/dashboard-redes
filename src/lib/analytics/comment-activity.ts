import type { CommentActivityItem } from "@/lib/platforms/types";

/**
 * Tope de piezas VIEJAS (fuera de COMMENTS_LOOKBACK_DAYS) cuyos
 * comentarios se vuelven a pedir por corrida: un solo lote en paralelo
 * (ver COMMENTS_CONCURRENCY en comments-sync.ts). Medido en vivo, dos
 * lotes seguidos llevaban la corrida a ~9,7s contra el timeout de 10s de
 * Vercel Hobby. Si hay más con actividad, las que no entraron quedan sin
 * checkpoint y se toman en las corridas siguientes (cron cada 10 min), las
 * de actividad más reciente primero — el arranque (backfill de todo el
 * contenido viejo con comentarios) converge en unas pocas corridas y en
 * régimen normal casi nunca hay más de 1-2 piezas con actividad nueva.
 */
export const MAX_OLD_POSTS_PER_RUN = 4;

/**
 * Presupuesto de tiempo del sync de una cuenta para ARRANCAR un lote de contenido viejo
 * (ms desde que arrancó). Medido en vivo: listado de actividad ~3,5 s y ~1,5 s por post con
 * Composio — un lote de 4 en paralelo puede tardar ~2 s más, y queda margen para la
 * clasificación, todo bajo el timeout de 10s de Vercel Hobby.
 */
export const OLD_POSTS_TIME_BUDGET_MS = 5500;

/**
 * Límite para el PRIMER lote de viejos: más holgado que el resto para que el contenido viejo
 * no se muera de hambre si un día el listado de actividad tarda más de lo normal (sin esto,
 * con el listado por encima de OLD_POSTS_TIME_BUDGET_MS ningún lote arrancaría nunca).
 */
export const OLD_POSTS_FIRST_BATCH_LIMIT_MS = 6000;

export interface ContentForActivity {
  id: string;
  external_id: string;
  published_at: string | null;
  meta: Record<string, unknown> | null;
}

export interface CommentCheckpoint {
  checkedAt?: string;
  countChecked?: number;
}

/** Lo que el sync guarda en content.meta al terminar de revisar los comentarios de una pieza. */
export function readCheckpoint(meta: Record<string, unknown> | null): CommentCheckpoint {
  const checkedAt = meta?.comments_checked_at;
  const countChecked = meta?.comments_count_checked;
  return {
    checkedAt: typeof checkedAt === "string" ? checkedAt : undefined,
    countChecked: typeof countChecked === "number" ? countChecked : undefined,
  };
}

export function buildCheckpointMeta(
  meta: Record<string, unknown> | null,
  checkedAt: string,
  activity: CommentActivityItem
): Record<string, unknown> {
  return {
    ...(meta ?? {}),
    comments_checked_at: checkedAt,
    ...(activity.commentCount !== undefined ? { comments_count_checked: activity.commentCount } : {}),
  };
}

function toMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * ¿Hay actividad de comentarios nueva desde el último chequeo?
 * - Sin checkpoint (nunca revisada): solo si la red dice que tiene comentarios.
 * - Con checkpoint: la pieza se modificó después del chequeo (Facebook mueve
 *   updated_time también cuando llega una respuesta, que no cambia el total
 *   de nivel superior) o cambió el total de comentarios (Instagram no tiene
 *   updated_time, solo el conteo).
 */
export function needsCommentCheck(activity: CommentActivityItem, checkpoint: CommentCheckpoint): boolean {
  const checkedMs = toMs(checkpoint.checkedAt);
  if (checkedMs === null) return (activity.commentCount ?? 0) > 0;

  const updatedMs = toMs(activity.updatedAt);
  if (updatedMs !== null && updatedMs > checkedMs) return true;

  if (
    activity.commentCount !== undefined &&
    checkpoint.countChecked !== undefined &&
    activity.commentCount !== checkpoint.countChecked
  ) {
    return true;
  }
  return false;
}

/**
 * De todo el contenido viejo, elige el que tiene actividad nueva (hasta
 * `max`), la actividad más reciente primero. Sin señal de fecha (Instagram),
 * desempata por más comentarios y luego por publicación más nueva.
 */
export function pickOldContentToRefresh<T extends ContentForActivity>(
  oldContent: T[],
  activity: CommentActivityItem[],
  max = MAX_OLD_POSTS_PER_RUN
): { content: T; activity: CommentActivityItem }[] {
  const byExternalId = new Map(activity.map((a) => [a.externalId, a]));
  const candidates: { content: T; activity: CommentActivityItem }[] = [];
  for (const content of oldContent) {
    const a = byExternalId.get(content.external_id);
    if (a && needsCommentCheck(a, readCheckpoint(content.meta))) candidates.push({ content, activity: a });
  }

  candidates.sort((x, y) => {
    const byUpdated = (toMs(y.activity.updatedAt) ?? 0) - (toMs(x.activity.updatedAt) ?? 0);
    if (byUpdated !== 0) return byUpdated;
    const byCount = (y.activity.commentCount ?? 0) - (x.activity.commentCount ?? 0);
    if (byCount !== 0) return byCount;
    return (toMs(y.content.published_at ?? undefined) ?? 0) - (toMs(x.content.published_at ?? undefined) ?? 0);
  });
  return candidates.slice(0, max);
}
