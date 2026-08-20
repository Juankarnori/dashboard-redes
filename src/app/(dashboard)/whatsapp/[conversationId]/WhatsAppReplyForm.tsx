"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendWhatsAppReply } from "@/lib/whatsapp/actions";
import { Button } from "@/components/ui/Button";

export function WhatsAppReplyForm({ conversationId, canReply }: { conversationId: string; canReply: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendWhatsAppReply(conversationId, message);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("");
      router.refresh();
    });
  }

  if (!canReply) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-3 text-sm text-ink-600">
        La ventana de 24h para responder gratis ya cerró. Esperá a que el contacto vuelva a
        escribir — las plantillas de marketing pre-aprobadas son de pago y no están soportadas acá.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escribí tu respuesta…"
        required
        rows={2}
        className="rounded-[0.5rem] border border-border bg-surface-0 px-3 py-2 text-sm text-ink-900"
      />
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
