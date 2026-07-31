"use client";

import { useState, useTransition, type FormEvent } from "react";
import { generatePromotion } from "./actions";
import { Button } from "@/components/ui/Button";

const OBJECTIVE_SUGGESTIONS = ["Vender más", "Dar a conocer producto nuevo", "Liquidar inventario"];

export function PromotionForm({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await generatePromotion({}, formData);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        + Promoción
      </Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-10 mt-2 flex w-80 flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4 shadow-lg"
        >
          <input type="hidden" name="brand_id" value={brandId} />
          <input
            name="product"
            placeholder="¿Qué vas a promocionar?"
            required
            className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-sm text-ink-900"
          />
          <input
            name="objective"
            list="objective-suggestions"
            placeholder="Objetivo (ej. vender más)"
            required
            className="h-8 rounded-[0.4rem] border border-border bg-surface-0 px-2 text-sm text-ink-900"
          />
          <datalist id="objective-suggestions">
            {OBJECTIVE_SUGGESTIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <p className="text-xs text-ink-400">
            Genera 3-5 variantes adaptadas a cada red conectada, guardadas en el banco de ideas.
          </p>
          {error && <p className="text-xs text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? "Generando…" : "Generar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
