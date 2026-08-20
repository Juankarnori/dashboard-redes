"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { replyToComment, refreshCommentsNow } from "@/lib/analytics/comment-actions";
import { REPLY_TEMPLATE } from "@/components/dashboard/ReplyForm";
import { Button } from "@/components/ui/Button";
import type { CommentInboxItem } from "@/lib/analytics/queries";
import type { CommentSentiment } from "@/types/db";
import { CommentInboxRow } from "./CommentInboxRow";
import { BulkReplyModal } from "./BulkReplyModal";
import { SENTIMENT_FILTERS, SENTIMENT_PRIORITY } from "./constants";

type Tab = "pending" | "all";
type SentimentFilter = CommentSentiment | "all";

export interface BulkState {
  phase: "confirm" | "running" | "done";
  targets: CommentInboxItem[]; // snapshot tomado al abrir el modal
  template: string;
  completed: number;
  results: { id: string; authorName: string | null; ok: boolean; error?: string }[];
}

export function CommentInbox({ comments: initialComments }: { comments: CommentInboxItem[] }) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [tab, setTab] = useState<Tab>("pending");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<BulkState | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  // `initialComments` cambia cuando el padre (server component) se
  // re-renderiza tras revalidatePath (p. ej. después de "Actualizar
  // ahora"). Ajuste de estado durante el render (patrón recomendado por
  // React para "resetear" estado cuando cambia un prop) en vez de un
  // efecto, que dispararía un render en cascada.
  const [prevInitialComments, setPrevInitialComments] = useState(initialComments);
  if (initialComments !== prevInitialComments) {
    setPrevInitialComments(initialComments);
    setComments(initialComments);
  }

  function handleRefreshNow() {
    setRefreshError(null);
    startRefresh(async () => {
      const result = await refreshCommentsNow();
      if (result.error) {
        setRefreshError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Bandera de corte para un futuro botón "Detener": el loop la revisa
  // antes de arrancar cada ítem. No aborta una llamada ya en vuelo (no
  // hay AbortController de por medio en una server action), solo evita
  // que arranque el siguiente.
  const cancelRequestedRef = useRef(false);

  const pendingComments = comments.filter((c) => !c.replied);
  const baseList = tab === "pending" ? pendingComments : comments;
  const filtered =
    sentimentFilter === "all" ? baseList : baseList.filter((c) => c.sentiment === sentimentFilter);
  // Sort estable: preserva el orden por fecha que ya viene de la query,
  // pero antepone leads y después negativos (quejas) — "priorizar ventas
  // y quejas" sin perder el resto del orden cronológico.
  const visible = [...filtered].sort(
    (a, b) => priorityOf(a.sentiment) - priorityOf(b.sentiment)
  );

  function handleReplied(commentId: string) {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, replied: true } : c)));
    setSelectedIds((prev) => {
      if (!prev.has(commentId)) return prev;
      const next = new Set(prev);
      next.delete(commentId);
      return next;
    });
  }

  function changeTab(next: Tab) {
    setTab(next);
    if (next !== "pending") setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selecciona sobre `visible` (respeta el filtro de sentimiento activo):
  // si filtraste a "Leads", "seleccionar todos" selecciona esos leads, no
  // todos los pendientes sin filtrar.
  function toggleSelectAllPending() {
    setSelectedIds((prev) => {
      const allSelected = visible.length > 0 && visible.every((c) => prev.has(c.id));
      return allSelected ? new Set() : new Set(visible.map((c) => c.id));
    });
  }

  function openBulkModal() {
    const targets = comments.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) return;
    setBulkState({ phase: "confirm", targets, template: REPLY_TEMPLATE, completed: 0, results: [] });
  }

  async function runBulkSend() {
    if (!bulkState) return;
    const { targets, template } = bulkState;
    cancelRequestedRef.current = false;
    setBulkState((prev) => (prev ? { ...prev, phase: "running" } : prev));

    for (const target of targets) {
      if (cancelRequestedRef.current) break;

      const result = await replyToComment(target.id, template);

      if (!result.error) {
        handleReplied(target.id);
      }

      setBulkState((prev) =>
        prev
          ? {
              ...prev,
              completed: prev.completed + 1,
              results: [
                ...prev.results,
                { id: target.id, authorName: target.author_name, ok: !result.error, error: result.error },
              ],
            }
          : prev
      );
    }

    setBulkState((prev) => (prev ? { ...prev, phase: "done" } : prev));
  }

  const allPendingSelected = visible.length > 0 && visible.every((c) => selectedIds.has(c.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "pending"} onClick={() => changeTab("pending")}>
            Pendientes {pendingComments.length > 0 && <span className="tabular text-ink-400">({pendingComments.length})</span>}
          </TabButton>
          <TabButton active={tab === "all"} onClick={() => changeTab("all")}>
            Todos
          </TabButton>
        </div>

        <div className="flex items-center gap-3">
          {refreshError && <p className="text-xs text-negative">{refreshError}</p>}
          <Button type="button" variant="ghost" size="sm" onClick={handleRefreshNow} disabled={isRefreshing}>
            {isRefreshing ? "Actualizando…" : "Actualizar ahora"}
          </Button>
          {tab === "pending" && selectedIds.size > 0 && (
            <Button type="button" variant="primary" size="sm" onClick={openBulkModal}>
              Enviar plantilla a seleccionados ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SENTIMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSentimentFilter(f.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              sentimentFilter === f.value
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-border bg-surface-1 text-ink-600 hover:text-ink-900"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tab === "pending" && pendingComments.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-xs font-medium text-ink-600">
          <input
            type="checkbox"
            checked={allPendingSelected}
            onChange={toggleSelectAllPending}
            className="h-4 w-4 accent-accent"
          />
          Seleccionar todos los pendientes
        </label>
      )}

      {visible.length === 0 ? (
        <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
          {baseList.length > 0
            ? "Ningún comentario coincide con este filtro."
            : tab === "pending"
              ? "No hay comentarios pendientes."
              : "Todavía no hay comentarios sincronizados."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((comment) => (
            <CommentInboxRow
              key={comment.id}
              comment={comment}
              onReplied={() => handleReplied(comment.id)}
              selectable={tab === "pending"}
              selected={selectedIds.has(comment.id)}
              onToggleSelect={() => toggleSelect(comment.id)}
            />
          ))}
        </div>
      )}

      {bulkState && (
        <BulkReplyModal
          state={bulkState}
          onTemplateChange={(value) => setBulkState((prev) => (prev ? { ...prev, template: value } : prev))}
          onConfirm={runBulkSend}
          onClose={() => setBulkState(null)}
        />
      )}
    </div>
  );
}

function priorityOf(sentiment: CommentSentiment | null): number {
  return sentiment ? SENTIMENT_PRIORITY[sentiment] : SENTIMENT_PRIORITY.neutral;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active ? "border-accent text-accent-strong" : "border-transparent text-ink-600 hover:text-ink-900"
      )}
    >
      {children}
    </button>
  );
}
