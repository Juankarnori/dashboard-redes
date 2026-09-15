import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { StatTile } from "@/components/dashboard/StatTile";
import { ThumbnailImage } from "@/components/dashboard/ThumbnailImage";
import { getComposioConnections, type ComposioConnection } from "@/lib/social/connections";
import { getInstagramProfile, getInstagramAccountInsights, getInstagramMedia } from "@/lib/social/instagram";
import { getFacebookPages, getFacebookPageProfile, getFacebookPageInsights, getFacebookPagePosts } from "@/lib/social/facebook";
import { getTikTokProfile, getTikTokVideos } from "@/lib/social/tiktok";
import type { ProviderContentItem } from "@/lib/platforms/types";
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
  const fbConnection = connections.find((c) => c.platform === "facebook");
  const ttConnection = connections.find((c) => c.platform === "tiktok");

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

        <AnalyticsSection
          title="Analíticas de Instagram — vía Composio (proof of concept)"
          composioConfigured={composioConfigured}
          connection={igConnection}
          connectLabel="Conectá Instagram por Composio arriba primero."
        >
          {igConnection && (
            <ComposioInstagramAnalytics
              userId={igConnection.composio_user_id}
              connectedAccountId={igConnection.composio_connected_account_id}
            />
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="Analíticas de Facebook — vía Composio (proof of concept)"
          composioConfigured={composioConfigured}
          connection={fbConnection}
          connectLabel="Conectá Facebook por Composio arriba primero."
        >
          {fbConnection && (
            <ComposioFacebookAnalytics
              userId={fbConnection.composio_user_id}
              connectedAccountId={fbConnection.composio_connected_account_id}
            />
          )}
        </AnalyticsSection>

        <AnalyticsSection
          title="Analíticas de TikTok — vía Composio (proof of concept)"
          composioConfigured={composioConfigured}
          connection={ttConnection}
          connectLabel="Conectá TikTok por Composio arriba primero."
        >
          {ttConnection && (
            <ComposioTikTokAnalytics
              userId={ttConnection.composio_user_id}
              connectedAccountId={ttConnection.composio_connected_account_id}
            />
          )}
        </AnalyticsSection>
      </div>
    </>
  );
}

function AnalyticsSection({
  title,
  composioConfigured,
  connection,
  connectLabel,
  children,
}: {
  title: string;
  composioConfigured: boolean;
  connection: ComposioConnection | undefined;
  connectLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">{title}</h2>
      {!composioConfigured ? (
        <p className="text-sm text-ink-400">Configurá COMPOSIO_API_KEY para ver esto.</p>
      ) : !connection ? (
        <p className="text-sm text-ink-400">{connectLabel}</p>
      ) : (
        children
      )}
    </section>
  );
}

function MediaGrid({ items }: { items: ProviderContentItem[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-400">Sin publicaciones.</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.externalId} className="relative aspect-square overflow-hidden rounded-[0.5rem] bg-surface-2">
          <ThumbnailImage src={item.thumbnailUrl ?? null} alt={item.caption ?? "Post"} className="object-cover" />
        </div>
      ))}
    </div>
  );
}

function AnalyticsError({ message }: { message: string | null }) {
  return (
    <div className="rounded-[--radius-card] border border-dashed border-negative bg-negative-soft px-4 py-3 text-sm text-negative">
      No se pudo traer analíticas por Composio: {message}
    </div>
  );
}

async function ComposioInstagramAnalytics({ userId, connectedAccountId }: { userId: string; connectedAccountId: string }) {
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
      getInstagramProfile(userId, connectedAccountId),
      getInstagramAccountInsights(userId, connectedAccountId, 7),
      getInstagramMedia(userId, connectedAccountId, 12),
    ]);
    data = { profile, insights, media };
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !data) return <AnalyticsError message={fetchError} />;

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
        <MediaGrid items={media} />
      </div>
    </div>
  );
}

async function ComposioFacebookAnalytics({ userId, connectedAccountId }: { userId: string; connectedAccountId: string }) {
  let data: {
    page: Awaited<ReturnType<typeof getFacebookPageProfile>>;
    insights: Awaited<ReturnType<typeof getFacebookPageInsights>>;
    posts: Awaited<ReturnType<typeof getFacebookPagePosts>>;
  } | null = null;
  let fetchError: string | null = null;

  try {
    const pages = await getFacebookPages(userId, connectedAccountId);
    const pageId = pages[0]?.id;
    if (!pageId) throw new Error("La cuenta no administra ninguna Página de Facebook.");

    const [page, insights, posts] = await Promise.all([
      getFacebookPageProfile(userId, connectedAccountId, pageId),
      getFacebookPageInsights(userId, connectedAccountId, pageId, 7),
      getFacebookPagePosts(userId, connectedAccountId, pageId, 12),
    ]);
    data = { page, insights, posts };
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !data) return <AnalyticsError message={fetchError} />;

  const { page, insights, posts } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4">
        {page.profilePictureUrl && (
          <div className="relative h-12 w-12 overflow-hidden rounded-full bg-surface-2">
            <ThumbnailImage src={page.profilePictureUrl} alt={page.name ?? "Página"} className="object-cover" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-900">{page.name ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Seguidores" value={(page.followersCount ?? page.fanCount)?.toLocaleString("es") ?? "—"} />
        <StatTile label="Seguidores (insights)" value={insights.follows?.toLocaleString("es") ?? "—"} />
        <StatTile label="Interacciones (7d)" value={insights.postEngagements?.toLocaleString("es") ?? "—"} />
        <StatTile label="Vistas de contenido (7d)" value={insights.mediaViews?.toLocaleString("es") ?? "—"} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Últimas publicaciones</h3>
        <MediaGrid items={posts} />
      </div>
    </div>
  );
}

async function ComposioTikTokAnalytics({ userId, connectedAccountId }: { userId: string; connectedAccountId: string }) {
  let data: {
    profile: Awaited<ReturnType<typeof getTikTokProfile>>;
    videos: Awaited<ReturnType<typeof getTikTokVideos>>;
  } | null = null;
  let fetchError: string | null = null;

  try {
    const [profile, videos] = await Promise.all([
      getTikTokProfile(userId, connectedAccountId),
      getTikTokVideos(userId, connectedAccountId, 12),
    ]);
    data = { profile, videos };
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  if (fetchError || !data) return <AnalyticsError message={fetchError} />;

  const { profile, videos } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4">
        {profile.avatarUrl && (
          <div className="relative h-12 w-12 overflow-hidden rounded-full bg-surface-2">
            <ThumbnailImage src={profile.avatarUrl} alt={profile.username ?? "Perfil"} className="object-cover" />
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-ink-900">@{profile.username ?? "—"}</p>
          <p className="text-xs text-ink-400">{profile.displayName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Seguidores" value={profile.followerCount?.toLocaleString("es") ?? "—"} />
        <StatTile label="Siguiendo" value={profile.followingCount?.toLocaleString("es") ?? "—"} />
        <StatTile label="Me gusta totales" value={profile.likesCount?.toLocaleString("es") ?? "—"} />
        <StatTile label="Videos" value={profile.videoCount?.toLocaleString("es") ?? "—"} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-600">Últimos videos</h3>
        <MediaGrid items={videos} />
      </div>
    </div>
  );
}
