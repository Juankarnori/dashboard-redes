"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createCalendarItem } from "./actions";
import { Button } from "@/components/ui/Button";

export function NewCalendarItemForm({
  brandId,
  campaigns,
}: {
  brandId: string;
  campaigns: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCalendarItem({}, formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
        + Pieza
      </Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-10 mt-2 flex w-72 flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4 shadow-lg"
        >
          <input type="hidden" name="brand_id" value={brandId} />
          <textarea
            name="idea"
            placeholder="¿Qué vas a publicar?"
            required
            rows={2}
            className="rounded-[0.4rem] border border-border bg-surface-0 px-2 py-1 text-sm text-ink-900"
          />
          <div className="flex gap-2">
            <input
              type="date"
              name="scheduled_for"
              required
              aria-label="Fecha"
              className="h-8 flex-1 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-900"
            />
            <select
              name="platform"
              aria-label="Red"
              className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-900"
            >
              <option value="">Sin definir</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          {campaigns.length > 0 && (
            <select
              name="campaign_id"
              aria-label="Campaña"
              className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-900"
            >
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="text-xs text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
