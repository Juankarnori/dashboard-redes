import { Button } from "@/components/ui/Button";
import type { BulkState } from "./CommentInbox";

/**
 * Puramente presentacional: todo el estado (fase, progreso, resultados)
 * vive en CommentInbox.tsx, que es quien corre el loop de envío. Este
 * componente solo pinta lo que le llega por props.
 */
export function BulkReplyModal({
  state,
  onTemplateChange,
  onConfirm,
  onClose,
}: {
  state: BulkState;
  onTemplateChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { phase, targets, template, completed, results } = state;
  const canClose = phase !== "running";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => canClose && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[--radius-card] border border-border bg-surface-0 p-5"
      >
        {phase === "confirm" && (
          <>
            <h2 className="text-sm font-semibold text-ink-900">
              Enviar plantilla a {targets.length} comentario{targets.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-xs text-ink-400">
              Este texto es solo para este envío — no cambia la plantilla default del botón individual.
            </p>
            <textarea
              value={template}
              onChange={(e) => onTemplateChange(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-[0.4rem] border border-border bg-surface-1 px-2 py-1.5 text-sm text-ink-900"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={onConfirm} disabled={!template.trim()}>
                Confirmar envío
              </Button>
            </div>
          </>
        )}

        {phase === "running" && (
          <>
            <h2 className="text-sm font-semibold text-ink-900">Enviando respuestas…</h2>
            <p className="tabular mt-2 text-sm text-ink-600">
              Enviando {Math.min(completed + 1, targets.length)} de {targets.length}…
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${(completed / targets.length) * 100}%` }}
              />
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <h2 className="text-sm font-semibold text-ink-900">Envío terminado</h2>
            <p className="mt-1 text-sm text-ink-600">
              <span className="text-positive">{results.filter((r) => r.ok).length} enviados</span>
              {" · "}
              <span className={results.some((r) => !r.ok) ? "text-negative" : "text-ink-400"}>
                {results.filter((r) => !r.ok).length} fallidos
              </span>
            </p>

            {results.some((r) => !r.ok) && (
              <div className="mt-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-[0.5rem] border border-border bg-surface-1 p-2">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <div key={r.id} className="text-xs">
                      <span className="font-medium text-ink-900">{r.authorName ?? "Usuario"}</span>
                      <span className="text-negative"> — {r.error}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button type="button" variant="primary" size="sm" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
