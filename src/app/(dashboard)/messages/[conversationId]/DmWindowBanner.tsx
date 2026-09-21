import { AlertTriangle, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DM_WINDOW_CLOSED_MESSAGES, type DmWindowState } from "@/lib/dms/window";

/** Con menos de este tiempo restante el banner pasa de verde a ámbar ("por cerrar"). */
const WARN_BELOW_HOURS = 3;

function formatLeft(hours: number): string {
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 && h < 6 ? `${h} h ${m} min` : `~${h} h`;
  }
  return `${Math.max(1, Math.round(hours * 60))} min`;
}

/**
 * Estado de la ventana de 24 h de Meta. Pegado arriba mientras se scrollea el hilo, y con
 * el estado cerrado en rojo y con la salida a la app: es lo primero que tiene que ver el
 * dueño antes de intentar responder. La UI solo informa; el servidor vuelve a chequear al enviar.
 */
export function DmWindowBanner({
  state,
  openInAppUrl,
  networkLabel,
}: {
  state: DmWindowState;
  openInAppUrl: string | null;
  networkLabel: string;
}) {
  const closed = !state.open;
  const soon = state.open && state.hoursLeft < WARN_BELOW_HOURS;

  const tone = closed
    ? "border-negative/40 bg-negative-soft text-negative"
    : soon
      ? "border-live/40 bg-live-soft text-live"
      : "border-positive/40 bg-positive-soft text-positive";
  const Icon = closed ? AlertTriangle : Clock;

  return (
    <div
      role={closed ? "alert" : "status"}
      className={cn("sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[--radius-card] border px-4 py-3 shadow-sm", tone)}
    >
      <Icon aria-hidden size={20} className="shrink-0" />
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-semibold">
          {closed
            ? "Ventana de 24 h cerrada — no se puede responder desde acá"
            : soon
              ? `La ventana se cierra pronto — quedan ${formatLeft(state.hoursLeft)}`
              : `Ventana de respuesta abierta — quedan ${formatLeft(state.hoursLeft)}`}
        </p>
        <p className="mt-0.5 text-xs text-ink-600">
          {state.open
            ? "Meta solo permite responder por API hasta 24 h después del último mensaje del cliente."
            : DM_WINDOW_CLOSED_MESSAGES[state.reason]}
        </p>
      </div>
      {closed && openInAppUrl && (
        <a
          href={openInAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[0.5rem] border border-negative/40 bg-surface-1 px-3 py-1.5 text-xs font-semibold text-negative transition-colors hover:bg-surface-2"
        >
          Abrir en {networkLabel}
          <ExternalLink aria-hidden size={13} />
        </a>
      )}
    </div>
  );
}
