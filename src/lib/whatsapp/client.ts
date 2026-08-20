/**
 * Envío de mensajes por WhatsApp Cloud API (Meta). Solo texto, solo
 * dentro de la ventana de servicio de 24h (ver service-window.ts) — nada
 * de plantillas de marketing, que son las únicas que cuestan.
 *
 * Reusa META_GRAPH_API_VERSION (mismo App de Meta que Instagram/Facebook)
 * y agrega las env vars propias de WhatsApp — ver .env.local.example.
 */
export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("WhatsApp no está configurado (faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).");
    this.name = "WhatsAppNotConfiguredError";
  }
}

function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v22.0";
}

/** Envía un mensaje de texto libre. Devuelve el wa_message_id que asigna Meta. */
export async function sendWhatsAppTextMessage(to: string, body: string): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) throw new WhatsAppNotConfiguredError();

  const res = await fetch(`https://graph.facebook.com/${graphApiVersion()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp: no se pudo enviar el mensaje (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { messages?: { id: string }[] };
  const waMessageId = data.messages?.[0]?.id;
  if (!waMessageId) throw new Error("WhatsApp: la respuesta no incluyó un message id.");
  return waMessageId;
}
