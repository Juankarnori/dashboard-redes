/**
 * Plantilla default de "Usar plantilla" en ReplyForm.tsx. Vive en un
 * archivo sin "use client" (a diferencia de ReplyForm) para que
 * comment-actions.ts (server-only) la pueda usar como referencia de
 * tono/CTA al generar sugerencias de respuesta con IA, sin cruzar el
 * límite cliente/servidor importando de un componente "use client".
 */
export const REPLY_TEMPLATE =
  "¡Gracias por tu comentario! 😊 Si quieres más información o hacer tu pedido, escríbenos por WhatsApp al +593 98 461 3243 y te ayudamos enseguida.";
