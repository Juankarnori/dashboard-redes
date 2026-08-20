import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getConversations } from "@/lib/whatsapp/queries";
import { isWithinServiceWindow } from "@/lib/whatsapp/service-window";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export default async function WhatsAppInboxPage() {
  const supabase = await createClient();
  const conversations = await getConversations(supabase);
  const configured = !!process.env.WHATSAPP_PHONE_NUMBER_ID && !!process.env.WHATSAPP_ACCESS_TOKEN;

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Conversaciones recibidas por WhatsApp Cloud API — lectura y respuesta manual, sin auto-respuesta."
      />

      {!configured && (
        <p className="mx-4 mt-4 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-2.5 text-xs text-ink-600 sm:mx-8">
          WhatsApp no está configurado todavía: faltan <code>WHATSAPP_PHONE_NUMBER_ID</code> /{" "}
          <code>WHATSAPP_ACCESS_TOKEN</code>. Podés seguir recibiendo mensajes si el webhook ya
          está conectado, pero no vas a poder responder hasta configurarlas — ver README.
        </p>
      )}

      <div className="px-4 py-6 sm:px-8">
        {conversations.length === 0 ? (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
            Todavía no llegó ningún mensaje. Verificá que el webhook esté configurado en Meta
            (ver README) y esperá a que un contacto te escriba.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {conversations.map((c) => {
              const open = isWithinServiceWindow(c.lastInboundAt);
              return (
                <Link
                  key={c.id}
                  href={`/whatsapp/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4 transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">
                        {c.contactName ?? c.contactWaId}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium",
                          open ? "bg-positive-soft text-positive" : "bg-surface-2 text-ink-400"
                        )}
                      >
                        {open ? "Ventana abierta" : "Ventana cerrada"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-600">
                      {c.lastMessagePreview ?? "(sin mensajes de texto)"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-400">{fmtDate(c.lastMessageAt)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
