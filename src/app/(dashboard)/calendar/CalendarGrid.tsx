"use client";

import { useState, useTransition, type DragEvent } from "react";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { rescheduleCalendarItem } from "./actions";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";

interface CalendarItem {
  id: string;
  idea: string | null;
  platform: string | null;
  scheduled_for: string | null;
  campaign_id: string | null;
}

interface DayCell {
  dateKey: string;
  dayOfMonth: string;
  inCurrentMonth: boolean;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarGrid({
  days,
  items,
  campaigns,
}: {
  days: DayCell[];
  items: CalendarItem[];
  campaigns: { id: string; name: string; color: string }[];
}) {
  const [, startTransition] = useTransition();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));

  const itemsByDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    if (!item.scheduled_for) continue;
    const key = item.scheduled_for.slice(0, 10);
    const bucket = itemsByDay.get(key) ?? [];
    bucket.push(item);
    itemsByDay.set(key, bucket);
  }

  function reschedule(itemId: string, newDateKey: string) {
    setErrorsById((prev) => ({ ...prev, [itemId]: "" }));
    setMovingId(itemId);
    startTransition(async () => {
      const result = await rescheduleCalendarItem(itemId, newDateKey);
      setMovingId(null);
      if (result.error) {
        setErrorsById((prev) => ({ ...prev, [itemId]: result.error! }));
      }
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, dateKey: string) {
    e.preventDefault();
    setDragOverKey(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) reschedule(itemId, dateKey);
  }

  return (
    <div>
      <p className="mb-2 text-xs text-ink-400 lg:hidden">Desliza para ver la semana completa →</p>

      <div className="overflow-x-auto rounded-[--radius-card] border border-border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b border-border bg-surface-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-2 text-center text-xs font-medium text-ink-400">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const dayItems = itemsByDay.get(day.dateKey) ?? [];
              return (
                <div
                  key={day.dateKey}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverKey(day.dateKey);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === day.dateKey ? null : k))}
                  onDrop={(e) => handleDrop(e, day.dateKey)}
                  className={cn(
                    "flex min-h-28 flex-col gap-1.5 border-b border-r border-border p-1.5 last:border-r-0",
                    !day.inCurrentMonth && "bg-surface-1/50",
                    dragOverKey === day.dateKey && "bg-accent-soft"
                  )}
                >
                  <span className={cn("tabular text-xs", day.inCurrentMonth ? "text-ink-600" : "text-ink-400")}>
                    {day.dayOfMonth}
                  </span>

                  {dayItems.map((item) => {
                    const campaignColor = item.campaign_id
                      ? campaignById.get(item.campaign_id)?.color
                      : undefined;
                    const isPending = movingId === item.id;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                        className={cn(
                          "flex flex-col gap-1 rounded-[0.45rem] border border-border bg-surface-0 p-1.5 text-xs",
                          "cursor-grab active:cursor-grabbing",
                          isPending && "opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-1">
                          {campaignColor && (
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: campaignColor }}
                            />
                          )}
                          {item.platform && <PlatformBadge platform={item.platform as Platform} />}
                        </div>
                        <p className="line-clamp-2 text-ink-900">{item.idea}</p>

                        {errorsById[item.id] && <p className="text-negative">{errorsById[item.id]}</p>}

                        {/* Respaldo para touch/mobile: el drag-and-drop nativo de HTML5
                            no funciona de forma confiable en navegadores móviles. */}
                        <input
                          type="date"
                          aria-label={`Reprogramar "${item.idea ?? "pieza"}"`}
                          defaultValue={day.dateKey}
                          disabled={isPending}
                          onChange={(e) => e.target.value && reschedule(item.id, e.target.value)}
                          className="w-full rounded-[0.35rem] border border-border bg-surface-1 px-1 py-0.5 text-[0.7rem] text-ink-600 disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
