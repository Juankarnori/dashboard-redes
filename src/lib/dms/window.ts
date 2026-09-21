/**
 * Ventana de mensajería de Meta: el negocio puede responder con texto libre hasta 24h
 * después del ÚLTIMO mensaje del cliente. Fuera de esa ventana Meta bloquea el envío
 * (Facebook exige messaging_type/tag; Instagram falla con error_subcode 2534022 y el tool
 * dice que no se reintente), así que la UI avisa y ofrece abrir el chat en la app, y el
 * servidor vuelve a chequear esto antes de mandar — nunca confía en lo que mostró la UI.
 *
 * Vive acá y no importa de lib/whatsapp/service-window.ts a propósito: WhatsApp está dado de
 * baja y ese código puede eliminarse; esto tiene sus propias razones de cierre (can_reply).
 */
export const DM_WINDOW_HOURS = 24;

export type DmWindowState =
  | { open: true; hoursLeft: number }
  | { open: false; reason: "no_customer_message" | "expired" | "blocked_by_network" };

/**
 * `lastInboundAt` = hora del último mensaje del CLIENTE (dm_conversations.last_inbound_at).
 * `canReply` = solo Facebook lo informa: si la red dice `false`, está cerrada aunque falten horas.
 */
export function getDmWindowState(
  lastInboundAt: string | null,
  canReply: boolean | null = null,
  now: Date = new Date()
): DmWindowState {
  if (canReply === false) return { open: false, reason: "blocked_by_network" };
  if (!lastInboundAt) return { open: false, reason: "no_customer_message" };

  const hoursSince = (now.getTime() - new Date(lastInboundAt).getTime()) / 3_600_000;
  if (hoursSince >= DM_WINDOW_HOURS) return { open: false, reason: "expired" };
  return { open: true, hoursLeft: Math.max(0, DM_WINDOW_HOURS - hoursSince) };
}

export function isDmWindowOpen(lastInboundAt: string | null, canReply: boolean | null = null, now: Date = new Date()): boolean {
  return getDmWindowState(lastInboundAt, canReply, now).open;
}

export const DM_WINDOW_CLOSED_MESSAGES: Record<"no_customer_message" | "expired" | "blocked_by_network", string> = {
  no_customer_message: "Este hilo no tiene mensajes del cliente: no hay a quién responder por API.",
  expired: "Pasaron más de 24 h desde el último mensaje del cliente: Meta no permite responder por API. Abrí el chat en la app.",
  blocked_by_network: "Meta indica que esta conversación no se puede responder ahora. Abrí el chat en la app.",
};
