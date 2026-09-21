"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DmInboxItem } from "@/lib/dms/queries";
import type { CommentSentiment } from "@/types/db";
import { SENTIMENT_FILTERS, SENTIMENT_PRIORITY } from "@/app/(dashboard)/comments/constants";
import { DmInboxRow } from "./DmInboxRow";

type Tab = "pending" | "all";
type SentimentFilter = CommentSentiment | "all";

/**
 * Bandeja de hilos. Mismos controles que la de Comentarios: Pendientes/Todos y el filtro por
 * sentimiento (los de negocio y red van en la URL, los pinta FilterBar en la página). Los
 * leads suben primero y después las quejas; el resto queda en orden de más reciente.
 * `nowIso` viene del servidor para que la ventana de 24 h se calcule igual al hidratar.
 */
export function DmInbox({ items, nowIso }: { items: DmInboxItem[]; nowIso: string }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const now = new Date(nowIso);

  const pending = items.filter((i) => !i.replied);
  const baseList = tab === "pending" ? pending : items;
  const filtered = sentimentFilter === "all" ? baseList : baseList.filter((i) => i.sentiment === sentimentFilter);
  const visible = [...filtered].sort((a, b) => priorityOf(a.sentiment) - priorityOf(b.sentiment));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "pending"} onClick={() => setTab("pending")}>
          Sin responder {pending.length > 0 && <span className="tabular text-ink-400">({pending.length})</span>}
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          Todos
        </TabButton>
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

      {visible.length === 0 ? (
        <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
          {baseList.length > 0
            ? "Ninguna conversación coincide con este filtro."
            : tab === "pending"
              ? items.length > 0
                ? "No hay conversaciones sin responder."
                : "Todavía no hay conversaciones sincronizadas."
              : "Todavía no hay conversaciones sincronizadas."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <DmInboxRow key={item.id} item={item} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function priorityOf(sentiment: CommentSentiment | null): number {
  return sentiment ? SENTIMENT_PRIORITY[sentiment] : SENTIMENT_PRIORITY.neutral;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
