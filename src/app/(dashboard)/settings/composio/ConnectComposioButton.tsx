"use client";

import { useState } from "react";
import { initiateComposioConnection, confirmComposioConnection } from "./actions";
import { Button } from "@/components/ui/Button";
import type { Platform } from "@/types/db";

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

/**
 * Conectar una cuenta vía Composio no es un click único: Composio nos da
 * un link de autorización, el dueño lo abre en otra pestaña y completa
 * el OAuth ahí, y recién cuando vuelve confirmamos que ya quedó activa.
 * No hay forma de automatizar la parte de "completar el login" desde acá.
 */
export function ConnectComposioButton({ brandId, platform }: { brandId: string; platform: Platform }) {
  const [step, setStep] = useState<"idle" | "pending" | "confirming">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    setStep("pending");
    const result = await initiateComposioConnection(brandId, platform);
    if (result.error || !result.redirectUrl) {
      setError(result.error ?? "No se recibió un link de autorización.");
      setStep("idle");
      return;
    }
    setRedirectUrl(result.redirectUrl);
    setConnectedAccountId(result.connectedAccountId ?? null);
  }

  async function handleConfirm() {
    if (!connectedAccountId) return;
    setError(null);
    setStep("confirming");
    const result = await confirmComposioConnection(brandId, platform, connectedAccountId);
    if (result.error) {
      setError(result.error);
      setStep("pending"); // puede que Meta/TikTok todavía no terminó — dejamos reintentar "Ya autoricé"
      return;
    }
    setStep("idle");
    setRedirectUrl(null);
    setConnectedAccountId(null);
  }

  if (step === "idle") {
    return (
      <div className="flex flex-col gap-1">
        <Button type="button" variant="secondary" size="sm" onClick={handleStart}>
          Conectar {PLATFORM_LABELS[platform]} por Composio
        </Button>
        {error && <p className="text-xs text-negative">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-3">
      {redirectUrl ? (
        <>
          <p className="text-xs text-ink-600">
            1. Abrí este link y autorizá {PLATFORM_LABELS[platform]}:
          </p>
          <a
            href={redirectUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-xs font-medium text-accent hover:underline"
          >
            {redirectUrl}
          </a>
          <p className="mt-1 text-xs text-ink-600">2. Cuando termines, volvé acá:</p>
          <Button type="button" variant="primary" size="sm" onClick={handleConfirm} disabled={step === "confirming"}>
            {step === "confirming" ? "Confirmando…" : "Ya autoricé"}
          </Button>
        </>
      ) : (
        <p className="text-xs text-ink-600">Generando link de autorización…</p>
      )}
      {error && <p className="text-xs text-negative">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setStep("idle");
          setRedirectUrl(null);
          setConnectedAccountId(null);
          setError(null);
        }}
        className="w-fit text-xs text-ink-400 hover:text-ink-900"
      >
        Cancelar
      </button>
    </div>
  );
}
