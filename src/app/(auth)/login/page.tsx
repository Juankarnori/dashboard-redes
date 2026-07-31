"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2">
            <span
              aria-hidden
              className="pulse-dot h-2 w-2 rounded-full bg-live"
            />
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-ink-400">
              Señal en vivo
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Social <span className="font-mono text-accent">Pulse</span>
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Métricas y recomendaciones de tus redes, en un solo lugar.
          </p>
        </div>

        <form
          action={formAction}
          className="rounded-[--radius-card] border border-border bg-surface-1 p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-600">Correo</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tú@negocio.com"
                className="h-10 rounded-[0.55rem] border border-border bg-surface-0 px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-600">Contraseña</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 rounded-[0.55rem] border border-border bg-surface-0 px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            {state.error && (
              <p className="rounded-[0.5rem] bg-negative-soft px-3 py-2 text-sm text-negative">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="mt-1 w-full">
              {isPending ? "Entrando…" : "Entrar"}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-400">
          Acceso reservado. Las cuentas se crean directamente en Supabase Auth.
        </p>
      </div>
    </main>
  );
}
