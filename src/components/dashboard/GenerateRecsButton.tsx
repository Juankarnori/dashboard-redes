"use client";

import { useActionState } from "react";
import { generateRecommendations, type GenerateRecsState } from "@/app/(dashboard)/recommendations/actions";
import { Button } from "@/components/ui/Button";

const initialState: GenerateRecsState = {};

export function GenerateRecsButton({ brandId }: { brandId: string }) {
  const [state, formAction, isPending] = useActionState(generateRecommendations, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="brand_id" value={brandId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Analizando…" : "Generar recomendaciones"}
      </Button>
      {state.error && <p className="max-w-xs text-right text-xs text-negative">{state.error}</p>}
    </form>
  );
}
