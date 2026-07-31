"use client";

import { useState, useTransition, type FormEvent } from "react";
import { refreshTrends } from "./actions";
import { Button } from "@/components/ui/Button";

export function TrendsRefreshForm({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await refreshTrends({}, formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        Actualizar tendencias
      </Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-10 mt-2 flex w-80 flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4 shadow-lg"
        >
          <input type="hidden" name="brand_id" value={brandId} />
          <input
            name="niche"
            placeholder="Nicho del negocio (ej. papelería y servicios estudiantiles)"
            required
            className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-sm text-ink-900"
          />
          <p className="text-xs text-ink-400">
            Busca en la web temas y hashtags en tendencia para este nicho y reemplaza las
            tendencias anteriores del negocio.
          </p>
          {error && <p className="text-xs text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
