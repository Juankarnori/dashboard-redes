import { dmDisplayText } from "@/lib/dms/labels";
import type { DmThreadMessage } from "@/lib/dms/queries";

/** Mensajes más recientes que entran en el transcript que se le manda a la IA. */
export const DM_TRANSCRIPT_MAX_MESSAGES = 12;

/**
 * Arma el historial de un hilo como texto plano para dárselo de contexto a la sugerencia de
 * IA — "Cliente: …" / "Vos: …", del más viejo al más nuevo, con los últimos
 * `DM_TRANSCRIPT_MAX_MESSAGES` nada más (alcanza para el contexto y mantiene el prompt
 * corto). Los mensajes sin texto usan la misma leyenda que ve el dueño en la UI
 * (`dmDisplayText`), así la IA sabe que hubo algo ahí aunque no pueda leerlo.
 */
export function buildDmTranscript(messages: DmThreadMessage[]): string {
  const recent = messages.slice(-DM_TRANSCRIPT_MAX_MESSAGES);
  return recent
    .map((m) => `${m.direction === "in" ? "Cliente" : "Vos"}: ${dmDisplayText(m.body, m.media_kind)}`)
    .join("\n");
}
