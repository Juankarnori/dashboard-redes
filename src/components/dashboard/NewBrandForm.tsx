"use client";

import { useActionState, useRef, useEffect } from "react";
import { createBrand } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/Button";

export function NewBrandForm() {
  const [state, formAction, isPending] = useActionState(createBrand, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error && !isPending) formRef.current?.reset();
  }, [state, isPending]);

  return (
    <form ref={formRef} action={formAction} className="flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <input
          name="name"
          placeholder="Nombre del negocio"
          required
          className="h-9 w-56 rounded-[0.5rem] border border-border bg-surface-0 px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-2 focus-visible:ring-accent"
        />
        {state.error && <p className="text-xs text-negative">{state.error}</p>}
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
        {isPending ? "Creando…" : "+ Negocio"}
      </Button>
    </form>
  );
}
