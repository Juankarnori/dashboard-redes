/**
 * Ventana de servicio de WhatsApp Cloud API: responder dentro de las 24h
 * desde el último mensaje ENTRANTE de ese contacto es gratis e ilimitado
 * (conversación de servicio). Pasada la ventana, la única forma de volver
 * a escribir es con una plantilla de marketing pre-aprobada — que es de
 * pago y queda fuera de alcance de esta fase (ver README).
 */
export const SERVICE_WINDOW_HOURS = 24;

/** `lastInboundAt` = sent_at del último mensaje direction='in' de la conversación. */
export function isWithinServiceWindow(lastInboundAt: string | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const hoursSince = (now.getTime() - new Date(lastInboundAt).getTime()) / 3_600_000;
  return hoursSince < SERVICE_WINDOW_HOURS;
}

/** Horas restantes de ventana (0 si ya cerró), para mostrar en la UI. */
export function hoursLeftInWindow(lastInboundAt: string | null, now: Date = new Date()): number {
  if (!lastInboundAt) return 0;
  const hoursSince = (now.getTime() - new Date(lastInboundAt).getTime()) / 3_600_000;
  return Math.max(0, SERVICE_WINDOW_HOURS - hoursSince);
}
