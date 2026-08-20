import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de WhatsApp Cloud API (Meta) — Fase 5. Sin sesión de usuario
 * (lo llama Meta), así que usa el admin client como /api/sync.
 *
 * GET: verificación de suscripción (Meta la hace una vez al configurar
 * el webhook en el panel de desarrolladores).
 * POST: eventos entrantes — mensajes nuevos y actualizaciones de status
 * (entregado/leído) de mensajes salientes.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected || mode !== "subscribe" || token !== expected || !challenge) {
    return NextResponse.json({ error: "Verificación fallida" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

/**
 * Meta firma el body con HMAC-SHA256 usando el secret de la app (mismo
 * META_APP_SECRET que ya usa el OAuth de Meta). No es parte explícita del
 * plan, pero es la protección estándar para un endpoint público sin otra
 * autenticación — y no requiere un secreto nuevo. Si META_APP_SECRET no
 * está configurado, no bloqueamos (para no romper un setup en progreso)
 * pero lo dejamos bien visible en el log.
 */
function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.warn("[webhooks/whatsapp] META_APP_SECRET no configurado — sin verificación de firma.");
    return true;
  }
  if (!header?.startsWith("sha256=")) return false;

  const expectedSig = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = header.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false; // longitud distinta u otro formato inesperado
  }
}

interface WhatsAppMessagePayload {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
}

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: WhatsAppMessagePayload[];
        statuses?: { id: string; status: string }[];
      };
    }[];
  }[];
}

async function getOwnerId(supabase: ReturnType<typeof createAdminClient>): Promise<string | null> {
  // App de un solo dueño: no hay registro público, así que el primer
  // (único) usuario de Supabase Auth es "el dueño" — ver README.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
  if (error || !data.users[0]) return null;
  return data.users[0].id;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let ownerId: string | null | undefined;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const contactNameByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null])
      );

      for (const message of value.messages ?? []) {
        if (ownerId === undefined) ownerId = await getOwnerId(supabase);
        if (!ownerId) {
          console.error("[webhooks/whatsapp] No hay ningún usuario dueño todavía — mensaje descartado.");
          continue;
        }

        const contactWaId = message.from;
        const sentAt = new Date(Number(message.timestamp) * 1000).toISOString();

        const { data: conversation, error: convError } = await supabase
          .from("whatsapp_conversations")
          .upsert(
            {
              owner_id: ownerId,
              contact_wa_id: contactWaId,
              contact_name: contactNameByWaId.get(contactWaId) ?? null,
              last_message_at: sentAt,
            },
            { onConflict: "contact_wa_id" }
          )
          .select("id")
          .single();

        if (convError || !conversation) {
          console.error(`[webhooks/whatsapp] No se pudo upsertear la conversación de ${contactWaId}:`, convError);
          continue;
        }

        const { error: msgError } = await supabase.from("whatsapp_messages").upsert(
          {
            conversation_id: conversation.id,
            wa_message_id: message.id,
            direction: "in",
            body: message.text?.body ?? null,
            msg_type: message.type,
            status: "received",
            sent_at: sentAt,
          },
          { onConflict: "wa_message_id" }
        );
        if (msgError) {
          console.error(`[webhooks/whatsapp] No se pudo guardar el mensaje ${message.id}:`, msgError);
        }
      }

      for (const status of value.statuses ?? []) {
        const { error } = await supabase
          .from("whatsapp_messages")
          .update({ status: status.status })
          .eq("wa_message_id", status.id);
        if (error) {
          console.error(`[webhooks/whatsapp] No se pudo actualizar el status de ${status.id}:`, error);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
