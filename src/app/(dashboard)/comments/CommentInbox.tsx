"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CommentInboxItem } from "@/lib/analytics/queries";
import { CommentInboxRow } from "./CommentInboxRow";

type Tab = "pending" | "all";

export function CommentInbox({ comments: initialComments }: { comments: CommentInboxItem[] }) {
  const [comments, setComments] = useState(initialComments);
  const [tab, setTab] = useState<Tab>("pending");

  const pendingCount = comments.filter((c) => !c.replied).length;
  const visible = tab === "pending" ? comments.filter((c) => !c.replied) : comments;

  function handleReplied(commentId: string) {
    // Optimista: no esperamos la revalidación del server para que el
    // comentario salte de "Pendientes" a "Todos" en la misma sesión.
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, replied: true } : c)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
          Pendientes {pendingCount > 0 && <span className="tabular text-ink-400">({pendingCount})</span>}
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          Todos
        </TabButton>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
          {tab === "pending" ? "No hay comentarios pendientes." : "Todavía no hay comentarios sincronizados."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((comment) => (
            <CommentInboxRow key={comment.id} comment={comment} onReplied={() => handleReplied(comment.id)} />
          ))}
        </div>
      )}
    </div>
  );
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
