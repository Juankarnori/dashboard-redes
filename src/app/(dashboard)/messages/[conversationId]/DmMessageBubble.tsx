import { ExternalLink, FileText, Image as ImageIcon, MessageSquareQuote, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DmThreadMessage } from "@/lib/dms/queries";
import type { DmMediaKind } from "@/types/db";

/**
 * Mensajes sin texto: la API devuelve `message` vacío y la causa aparte. Nunca se pinta un
 * globo en blanco — se explica qué es y, si la API no lo puede mostrar, se manda a la app.
 */
const MEDIA_NOTES: Record<DmMediaKind, { title: string; hint: string; icon: typeof FileText }> = {
  unsupported: {
    title: "Mensaje que no se puede mostrar acá",
    hint: "Abrí la app para verlo (audio, sticker, reel u otro contenido que la API no expone).",
    icon: Smartphone,
  },
  attachment: {
    title: "Adjunto",
    hint: "Imagen, audio o archivo. Abrí la app para verlo.",
    icon: ImageIcon,
  },
  share: {
    title: "Publicación compartida",
    hint: "Te compartió una publicación. Abrí la app para verla.",
    icon: FileText,
  },
  story: {
    title: "Respuesta a una historia",
    hint: "Respondió a una historia. Abrí la app para ver a cuál.",
    icon: MessageSquareQuote,
  },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function DmMessageBubble({
  message,
  openInAppUrl,
  networkLabel,
}: {
  message: DmThreadMessage;
  openInAppUrl: string | null;
  networkLabel: string;
}) {
  const out = message.direction === "out";
  const hasText = !!message.body?.trim();
  const note = message.media_kind ? MEDIA_NOTES[message.media_kind] : null;

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]", out ? "items-end" : "items-start")}>
        {hasText ? (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-[--radius-card] px-3 py-2 text-sm",
              out ? "border border-accent/30 bg-accent-soft text-ink-900" : "border border-border bg-surface-1 text-ink-900"
            )}
          >
            {message.body}
          </div>
        ) : note ? (
          <div className="flex items-start gap-2.5 rounded-[--radius-card] border border-dashed border-border bg-surface-2 px-3 py-2.5 text-sm text-ink-600">
            <note.icon aria-hidden size={16} className="mt-0.5 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <p className="font-medium text-ink-900">{note.title}</p>
              <p className="mt-0.5 text-xs">{note.hint}</p>
              {openInAppUrl && (
                <a
                  href={openInAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Abrir en {networkLabel}
                  <ExternalLink aria-hidden size={12} />
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-2 px-3 py-2 text-sm italic text-ink-400">
            [Mensaje vacío]
          </div>
        )}

        {hasText && note && <p className="text-[0.7rem] text-ink-400">Incluye: {note.title.toLowerCase()}</p>}

        <p suppressHydrationWarning className="tabular px-1 text-[0.65rem] text-ink-400">
          {fmtTime(message.sent_at)}
        </p>
      </div>
    </div>
  );
}
