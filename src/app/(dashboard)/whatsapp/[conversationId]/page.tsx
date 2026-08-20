import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getConversationDetail } from "@/lib/whatsapp/queries";
import { isWithinServiceWindow, hoursLeftInWindow } from "@/lib/whatsapp/service-window";
import { cn } from "@/lib/utils";
import { WhatsAppReplyForm } from "./WhatsAppReplyForm";

export const dynamic = "force-dynamic";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export default async function WhatsAppConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const detail = await getConversationDetail(supabase, conversationId);

  if (!detail) notFound();

  const canReply = isWithinServiceWindow(detail.lastInboundAt);
  const hoursLeft = hoursLeftInWindow(detail.lastInboundAt);

  return (
    <>
      <PageHeader
        title={detail.contactName ?? detail.contactWaId}
        description={detail.contactName ? detail.contactWaId : undefined}
        action={
          <Link href="/whatsapp" className="text-xs font-medium text-accent hover:underline">
            ← Volver a la bandeja
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 py-6 sm:px-8">
        {canReply && (
          <p className="text-xs text-ink-400">
            Ventana de servicio abierta — quedan ~{Math.floor(hoursLeft)}h para responder gratis.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {detail.messages.length === 0 ? (
            <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
              Sin mensajes todavía.
            </div>
          ) : (
            detail.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-[--radius-card] px-3 py-2 text-sm",
                    m.direction === "out"
                      ? "bg-accent text-white"
                      : "border border-border bg-surface-1 text-ink-900"
                  )}
                >
                  <p>{m.body ?? `(mensaje de tipo ${m.msgType})`}</p>
                  <p
                    className={cn(
                      "tabular mt-1 text-[0.65rem]",
                      m.direction === "out" ? "text-white/70" : "text-ink-400"
                    )}
                  >
                    {fmtTime(m.sentAt)}
                    {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <WhatsAppReplyForm conversationId={detail.id} canReply={canReply} />
      </div>
    </>
  );
}
