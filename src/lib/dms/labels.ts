import type { DmMediaKind } from "@/types/db";

/**
 * Mensajes sin texto: la API devuelve `message` vacío y la causa aparte. Verificado en vivo
 * en Instagram: 22 de 44 mensajes venían así (16 `unsupported`, 3 `share`, 2 `story`,
 * 1 `attachment`). Nunca se debe mostrar un mensaje en blanco.
 */
export const DM_MEDIA_LABELS: Record<DmMediaKind, string> = {
  attachment: "[Adjunto]",
  share: "[Publicación compartida]",
  story: "[Respuesta a una historia]",
  unsupported: "[Mensaje que la API no puede mostrar — abrilo en la app]",
};

/** Texto para mostrar de un mensaje (o del último mensaje de un hilo). */
export function dmDisplayText(text: string | null | undefined, media: DmMediaKind | null | undefined): string {
  const t = (text ?? "").trim();
  if (t) return t;
  return media ? DM_MEDIA_LABELS[media] : "[Mensaje vacío]";
}
