"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { suggestDmReply } from "@/lib/dms/dm-actions";
import { Button } from "@/components/ui/Button";

/**
 * Borrador de respuesta del hilo. Por ahora es SOLO un borrador: no hay botón de enviar
 * (eso es la sub-parte 6, coordinada con el dueño). "Sugerir con IA" es a demanda —
 * nunca se autocompleta al abrir el hilo — y el texto que trae siempre queda en un
 * textarea editable, nunca se manda solo. "Copiar" es la salida de este borrador
 * mientras no hay envío directo: se pega a mano en la app.
 */
export function DmComposer({ conversationId, networkLabel }: { conversationId: string; networkLabel: string }) {
  const [draft, setDraft] = useState("");
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    setError(null);
    setIsSuggesting(true);
    try {
      const result = await suggestDmReply(conversationId);
      if (result.error) setError(result.error);
      else if (result.suggestion) setDraft(result.suggestion);
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleCopy() {
    if (!draft.trim()) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar. Seleccioná el texto a mano.");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4">
      <label htmlFor="dm-draft" className="text-xs font-semibold text-ink-900">
        Borrador de respuesta
      </label>
      <textarea
        id="dm-draft"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Escribí una respuesta o pedile una sugerencia a la IA…"
        rows={3}
        className="rounded-[0.4rem] border border-border bg-surface-0 px-2.5 py-2 text-sm text-ink-900"
      />

      {error && <p className="text-xs text-negative">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={isSuggesting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60"
        >
          <Sparkles aria-hidden size={14} />
          {isSuggesting ? "Redactando…" : "Sugerir con IA"}
        </button>

        <Button type="button" variant="ghost" size="sm" onClick={handleCopy} disabled={!draft.trim()}>
          {copied ? (
            <span className="inline-flex items-center gap-1.5">
              <Check aria-hidden size={14} />
              Copiado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Copy aria-hidden size={14} />
              Copiar
            </span>
          )}
        </Button>
      </div>

      <p className="text-xs text-ink-400">
        Por ahora esto arma el texto — el envío directo desde acá todavía no está disponible. Copialo y pegalo en{" "}
        {networkLabel}.
      </p>
    </div>
  );
}
