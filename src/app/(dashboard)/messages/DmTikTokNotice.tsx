/** Aviso al filtrar por TikTok: no tiene API de mensajes directos, la bandeja siempre está vacía. */
export function DmTikTokNotice() {
  return (
    <p className="mx-4 mt-4 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-2.5 text-xs text-ink-600 sm:mx-8">
      TikTok no tiene una API de mensajes directos para cuentas de negocio, por eso esta bandeja siempre va a estar
      vacía para TikTok. Respondé los mensajes directamente desde la app de TikTok.
    </p>
  );
}
