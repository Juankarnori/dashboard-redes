import Link from "next/link";
import { cn } from "@/lib/utils";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { dmDisplayText } from "@/lib/dms/labels";
import { getDmWindowState } from "@/lib/dms/window";
import type { DmInboxItem } from "@/lib/dms/queries";
import { SENTIMENT_LABELS, SENTIMENT_BADGE_CLASSES } from "@/app/(dashboard)/comments/constants";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

function formatHoursLeft(hours: number): string {
  return hours >= 1 ? `${Math.floor(hours)} h` : `${Math.max(1, Math.round(hours * 60))} min`;
}

/**
 * Fila de la bandeja de Mensajes: una tarjeta que lleva al hilo. `now` llega por prop (no
 * `new Date()` acá) para que el render del servidor y el de hidratación coincidan.
 */
export function DmInboxRow({ item, now }: { item: DmInboxItem; now: Date }) {
  const name = item.participant_name ?? "Usuario";
  const pending = !item.replied;
  const windowState = getDmWindowState(item.last_inbound_at, item.can_reply, now);
  const preview = dmDisplayText(item.last_message_text, item.last_message_media);

  return (
    <Link
      href={`/messages/${item.id}`}
      className="flex gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("truncate text-sm text-ink-900", pending ? "font-semibold" : "font-medium")}>{name}</span>
          <span suppressHydrationWarning className="tabular shrink-0 text-xs text-ink-400">
            {formatWhen(item.last_message_at)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PlatformBadge platform={item.platform} />
          {item.sentiment && item.sentiment !== "neutral" && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                SENTIMENT_BADGE_CLASSES[item.sentiment]
              )}
            >
              {SENTIMENT_LABELS[item.sentiment]}
            </span>
          )}
          {item.brand && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.brand.color }} />
              {item.brand.name}
            </span>
          )}
          <span className="text-xs text-ink-400">{item.account_label}</span>
        </div>

        <p className={cn("mt-1.5 line-clamp-2 text-sm", pending ? "text-ink-900" : "text-ink-600")}>
          {item.last_message_direction === "out" && <span className="text-ink-400">Vos: </span>}
          {preview}
        </p>

        {pending && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live-soft px-2 py-0.5 text-live">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-live" />
              Sin responder
            </span>
            {windowState.open ? (
              <span className="text-positive">Podés responder — quedan ~{formatHoursLeft(windowState.hoursLeft)}</span>
            ) : (
              <span className="text-negative">Ventana de 24 h cerrada — respondé desde la app</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
