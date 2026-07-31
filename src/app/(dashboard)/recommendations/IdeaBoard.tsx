"use client";

import { useState, useTransition } from "react";
import { updateRecommendationStatus } from "./actions";
import { KIND_LABELS } from "./constants";
import type { Database, RecommendationStatus } from "@/types/db";

type Recommendation = Database["public"]["Tables"]["recommendations"]["Row"];

const COLUMNS: { status: RecommendationStatus; label: string }[] = [
  { status: "pending", label: "Ideas pendientes" },
  { status: "in_progress", label: "En progreso" },
  { status: "published", label: "Publicadas" },
];

export function IdeaBoard({ ideas }: { ideas: Recommendation[] }) {
  const [, startTransition] = useTransition();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});

  function handleMove(idea: Recommendation, status: RecommendationStatus) {
    if (status === idea.status) return;
    setErrorsById((prev) => ({ ...prev, [idea.id]: "" }));
    setMovingId(idea.id);
    startTransition(async () => {
      const result = await updateRecommendationStatus(idea.id, status);
      setMovingId(null);
      if (result.error) {
        setErrorsById((prev) => ({ ...prev, [idea.id]: result.error! }));
      }
      // revalidatePath en el server action refresca esta ruta sin recargar
      // el navegador — `ideas` llega ya actualizado desde el padre.
    });
  }

  if (ideas.length === 0) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
        Sin ideas todavía. Generá algunas con el botón de arriba.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((column) => {
        const columnIdeas = ideas.filter((idea) => idea.status === column.status);
        return (
          <div key={column.status} className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                {column.label}
              </h3>
              <span className="tabular text-xs text-ink-400">{columnIdeas.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {columnIdeas.length === 0 ? (
                <p className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-6 text-center text-xs text-ink-400">
                  Vacío
                </p>
              ) : (
                columnIdeas.map((idea) => {
                  const otherColumns = COLUMNS.filter((c) => c.status !== idea.status);
                  const isPending = movingId === idea.id;

                  return (
                    <div
                      key={idea.id}
                      className="flex flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4"
                    >
                      <span className="text-xs font-medium uppercase tracking-wide text-accent">
                        {KIND_LABELS[idea.kind] ?? idea.kind}
                      </span>
                      <h4 className="text-sm font-semibold text-ink-900">{idea.title}</h4>
                      <p className="text-sm text-ink-600">{idea.body}</p>

                      {errorsById[idea.id] && (
                        <p className="text-xs text-negative">{errorsById[idea.id]}</p>
                      )}

                      <select
                        aria-label={`Mover "${idea.title}" a otra columna`}
                        value=""
                        disabled={isPending}
                        onChange={(e) => handleMove(idea, e.target.value as RecommendationStatus)}
                        className="mt-1 h-7 self-start rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-600 transition-colors hover:bg-surface-2 disabled:opacity-50"
                      >
                        <option value="" disabled>
                          {isPending ? "Moviendo…" : "Mover a…"}
                        </option>
                        {otherColumns.map((c) => (
                          <option key={c.status} value={c.status}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
