"use client";

import { useState, useTransition, type FormEvent } from "react";
import { replyToComment, suggestCommentReply } from "@/lib/analytics/comment-actions";
import { REPLY_TEMPLATE } from "@/lib/analytics/reply-template";
import { Button } from "@/components/ui/Button";

export { REPLY_TEMPLATE };

/** Formulario de "responder" compartido entre /content/[id] y /comments. */
export function ReplyForm({
  commentId,
  replied,
  onReplied,
  isLead = false,
}: {
  commentId: string;
  replied: boolean;
  /** Se llama tras publicar la respuesta con éxito, para actualizar estado local sin recargar. */
  onReplied?: () => void;
  /** Muestra "Sugerir con IA" — solo tiene sentido en comentarios con intención de compra. */
  isLead?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await replyToComment(commentId, message);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setMessage("");
        onReplied?.();
      }
    });
  }

  async function handleSuggest() {
    setError(null);
    setIsSuggesting(true);
    try {
      const result = await suggestCommentReply(commentId);
      if (result.error) setError(result.error);
      else if (result.suggestion) setMessage(result.suggestion);
    } finally {
      setIsSuggesting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-accent hover:underline"
      >
        {replied ? "Responder de nuevo" : "Responder"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <textarea
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escribí tu respuesta…"
        required
        rows={2}
        className="rounded-[0.4rem] border border-border bg-surface-0 px-2 py-1 text-sm text-ink-900"
      />
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMessage(REPLY_TEMPLATE)}
            className="text-xs font-medium text-accent hover:underline"
          >
            Usar plantilla
          </button>
          {isLead && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={isSuggesting}
              className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
            >
              {isSuggesting ? "Redactando…" : "🔥 Sugerir con IA"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              setMessage("");
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={isPending}>
            {isPending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
