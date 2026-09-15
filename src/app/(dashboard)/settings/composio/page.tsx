import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { StatTile } from "@/components/dashboard/StatTile";
import { ThumbnailImage } from "@/components/dashboard/ThumbnailImage";
import { getComposioConnections } from "@/lib/social/connections";
import { getInstagramProfile, getInstagramAccountInsights, getInstagramMedia } from "@/lib/social/instagram";
import { ConnectComposioButton } from "./ConnectComposioButton";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

const PLATFORMS: Platform[] = ["instagram", "facebook", "tiktok"];

/**
 * Fase 1 (motor Composio): pantalla de prueba de punta a punta.
 * - Conectar cuentas por Composio (sin tocar el flujo OAuth directo actual).
 * - Para Instagram, trae analíticas EN VIVO vía composio.tools.execute —
 *   el proof of concept pedido para esta fase. Si algo falla, se muestra
 *   el error tal cual (nada de fallback silencioso acá: esto es
 *   justamente para verificar que el camino nuevo funciona).
 */
export default async function ComposioSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color").order("created_at");
  const selectedBrandId = brand ?? brands?.[0]?.id;

  if (!selectedBrandId) {
    return (
      <>
        <PageHeader title="Composio" description="Motor de integración nuevo (Fase 1) — todavía en prueba." />
        <div className="mx-4 mt-6 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600 sm:mx-8">
          Creá un negocio primero en Cuentas.
        </div>
      </>
    );
  }

  const connections = await getComposioConnections(supabase, selectedBrandId);
  const composioConfigured = !!process.env.COMPOSIO_API_KEY;
  const igConnection = connections.find((c) => c.platform === "instagram");

  return (
    <>
      <PageHeader
        title="Composio"
        description="Motor de integración nuevo (Fase 1) — corre en paralelo a la integración directa actual, no la reemplaza todavía."
      />

      <div className="flex flex-wrap gap-2 px-4 pt-5 sm:px-8">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/settings/composio?brand=${b.id}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              b.id === selectedBrandId
                ? "border-accent bg-accent-soft text-accent-strong"
                : "border-border bg-surface-1 text-ink-600 hover:bg-surface-2"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: b.color }} />
            {b.name}
          </a>
        ))}
      </div>

      {!composioConfigured && (
        <p className="mx-4 mt-4 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-2.5 text-xs text-ink-600 sm:mx-8">
          Falta <code>COMPOSIO_API_KEY</code> en el entorno — conseguila en{" "}
          <a href="https://app.composio.dev" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            app.composio.dev
          </a>{" "}
          y agregala a <code>.env.local</code>. Sin esto, nada de lo de abajo va a funcionar.
        </p>
      )}

      <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Conexiones</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const platformConnections = connections.filter((c) => c.platform === platform);
              return (
                <div key={platform} className="flex flex-col gap-2 rounded-[--radius-card] border border-border bg-surface-1 p-4">
                  <PlatformBadge platform={platform} />
                  {platformConnections.length === 0 ? (
                    <p className="text-xs text-ink-400">Sin conectar todavía.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {platformConnections.map((c) => (
                        <li key={c.id} className="text-xs text-ink-600">
                          {c.external_username || c.alias || c.composio_connected_account_id}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ConnectComposioButton brandId={selectedBrandId} platform={platform} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            Analíticas de Instagram — vía Composio (proof of concept)
          </h2>
          {!composioConfigured ? (
            <p className="text-sm text-ink-400">Configurá COMPOSIO_API_KEY para ver esto.</p>
          ) : !igConnection ? (
            <p className="text-sm text-ink-400">Conectá Instagram por Composio arriba primero.</p>
          ) : (
            <ComposioInstagramAnalytics connectedAccountId={igConnection.composio_connected_account_id} />
          )}
        </section>
      </div>
    </>
  );
}

async function ComposioInstagramAnalytics({ connectedAccountId }: { connectedAccountId: string }) {
  // JSX no se construye dentro del try: React no captura errores de
  // render con try/catch (solo error boundaries), así que separamos "ir
  // a buscar los datos" (esto sí puede tirar y acá sí lo atrapamos) de
  // "renderizar con lo que haya vuelto".
  let data: {
    profile: Awaited<ReturnType<typeof getInstagramProfile>>;
    insights: Awaited<ReturnType<typeof getInstagramAccountInsights>>;
    media: Awaited<ReturnType<typeof getInstagramMedia>>;
  } | null = null;
  let fetchError: string | null = null;

  try {
    const [profile, insights, media] = await Promise.all([
      getInstagramProfile(connectedAccountId),
      getInstagramAccountInsights(connectedAccountId, 7),
      getInstagramMedia(connectedAccountId, 12),
    ]);
    data = { profile, insights, media };
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !data) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-negative bg-negative-soft px-4 py-3 text-sm text-negative">
        No se pudo traer analíticas por Composio: {fetchError}
      </div>
    );
  }

  const { profile, insights, media } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4">
        {profile.profilePictureUrl && (
          <div className="relative h-12 w-12 overflow-hidden rounded-full bg-surface-2">
            <ThumbnailImage src={profile.profilePictureUrl} alt={profile.username ?? "Perfil"} className="object-cover" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-900">@{profile.username ?? "—"}</p>
          <p className="text-xs text-ink-400">{profile.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Seguidores" value={profile.followersCount?.toLocaleString("es") ?? "—"} />
        <StatTile label="Alcance (7d)" value={insights.reach?.toLocaleString("es") ?? "—"} />
        <StatTile label="Cuentas alcanzadas (7d)" value={insights.accountsEngaged?.toLocaleString("es") ?? "—"} />
        <StatTile label="Interacciones (7d)" value={insights.totalInteractions?.toLocaleString("es") ?? "—"} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Últimas publicaciones</h3>
        {media.length === 0 ? (
          <p className="text-sm text-ink-400">Sin publicaciones.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {media.map((item) => (
              <div key={item.externalId} className="relative aspect-square overflow-hidden rounded-[0.5rem] bg-surface-2">
                <ThumbnailImage src={item.thumbnailUrl ?? null} alt={item.caption ?? "Post"} className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
