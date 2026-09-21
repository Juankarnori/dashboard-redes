import { ExternalLink } from "lucide-react";
import { getDmWindowState } from "@/lib/dms/window";
import { dmOpenInAppUrl, DM_NETWORK_LABELS } from "@/lib/dms/links";
import type { DmThread } from "@/lib/dms/queries";
import { DmWindowBanner } from "./DmWindowBanner";
import { DmMessageBubble } from "./DmMessageBubble";

function dayLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/**
 * Cuerpo de /messages/[conversationId]: banner de ventana, mensajes (más viejo arriba) y
 * pie. Es un componente de servidor y NO recibe participant_id: ese dato (el recipient_id
 * para responder) se queda en el servidor. `now` por parámetro para poder probarlo con
 * datos de prueba y horas fijas.
 */
export function DmThreadView({ thread, now = new Date() }: { thread: DmThread; now?: Date }) {
  const { conversation, platform, messages } = thread;
  const windowState = getDmWindowState(conversation.last_inbound_at, conversation.can_reply, now);
  const openInAppUrl = dmOpenInAppUrl(platform, conversation.link);
  const networkLabel = DM_NETWORK_LABELS[platform] ?? "la app";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8">
      <DmWindowBanner state={windowState} openInAppUrl={openInAppUrl} networkLabel={networkLabel} />

      {messages.length === 0 ? (
        <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
          Sin mensajes todavía.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <div key={m.id} className="flex flex-col gap-2.5">
              {(i === 0 || dayKey(messages[i - 1].sent_at) !== dayKey(m.sent_at)) && (
                <p suppressHydrationWarning className="my-1 text-center text-xs font-medium text-ink-400">
                  {dayLabel(m.sent_at)}
                </p>
              )}
              <DmMessageBubble message={m} openInAppUrl={openInAppUrl} networkLabel={networkLabel} />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-3 text-xs text-ink-600">
        <p>Por ahora esta bandeja es de solo lectura: para responder, abrí el chat en {networkLabel}.</p>
        {openInAppUrl && (
          <a
            href={openInAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
          >
            Abrir en {networkLabel}
            <ExternalLink aria-hidden size={13} />
          </a>
        )}
      </div>
    </div>
  );
}
