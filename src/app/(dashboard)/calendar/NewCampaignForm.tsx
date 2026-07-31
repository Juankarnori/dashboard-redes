"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createCampaign } from "./actions";
import { Button } from "@/components/ui/Button";

export function NewCampaignForm({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createCampaign({}, formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        + Campaña
      </Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-10 mt-2 flex w-72 flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4 shadow-lg"
        >
          <input type="hidden" name="brand_id" value={brandId} />
          <input
            name="name"
            placeholder="Nombre de la campaña"
            required
            className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-sm text-ink-900"
          />
          <div className="flex gap-2">
            <input
              type="date"
              name="start_date"
              required
              aria-label="Fecha de inicio"
              className="h-8 flex-1 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-900"
            />
            <input
              type="date"
              name="end_date"
              required
              aria-label="Fecha de fin"
              className="h-8 flex-1 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-xs text-ink-900"
            />
          </div>
          <textarea
            name="objective"
            placeholder="Objetivo (opcional)"
            rows={2}
            className="rounded-[0.4rem] border border-border bg-surface-0 px-2 py-1 text-sm text-ink-900"
          />
          {error && <p className="text-xs text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Creando…" : "Crear"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
