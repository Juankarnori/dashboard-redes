"use client";

import { useState, useTransition, type FormEvent } from "react";
import { replyToComment } from "@/lib/analytics/comment-actions";
import { Button } from "@/components/ui/Button";

/** Formulario de "responder" compartido entre /content/[id] y /comments. */
export function ReplyForm({
  commentId,
  replied,
  onReplied,
}: {
  commentId: string;
  replied: boolean;
  /** Se llama tras publicar la respuesta con éxito, para actualizar estado local sin recargar. */
  onReplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = String(formData.get("message") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await replyToComment(commentId, message);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        onReplied?.();
      }
    });
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
        placeholder="Escribí tu respuesta…"
        required
        rows={2}
        className="rounded-[0.4rem] border border-border bg-surface-0 px-2 py-1 text-sm text-ink-900"
      />
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          {isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
