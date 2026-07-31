import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { StatTile } from "@/components/dashboard/StatTile";
import { FollowerGrowthChart } from "@/components/charts/FollowerGrowthChart";
import { PlatformComparisonChart } from "@/components/charts/PlatformComparisonChart";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { getOverview, getActiveAlerts } from "@/lib/analytics/queries";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";

// Datos por usuario/sesión — nunca debe servirse una versión cacheada
// entre distintos usuarios ni quedarse con el snapshot del build.
export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string }>;
}) {
  const { brand, platform } = await searchParams;
  const supabase = await createClient();

  const { data: brands } = await supabase.from("brands").select("id, name, color");
  const { count: accountCount } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true });

  if (!accountCount) {
    return (
      <>
        <PageHeader
          title="Resumen"
          description="Comparativa por red y por negocio de todas tus cuentas conectadas."
        />
        <div className="mx-4 mt-10 flex flex-col items-center rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-16 text-center sm:mx-8 sm:px-8">
          <span aria-hidden className="pulse-dot mb-4 h-2.5 w-2.5 rounded-full bg-live" />
          <h2 className="text-base font-semibold text-ink-900">Todavía no hay señal</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-600">
            Conecta tu primera cuenta de Instagram o Facebook para empezar a ver
            métricas, contenido y recomendaciones.
          </p>
          <Link
            href="/settings/accounts"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-[0.55rem] bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Conectar una cuenta
          </Link>
        </div>
      </>
    );
  }

  const overviewFilters = { brandId: brand, platform: platform as Platform | undefined };
  const [overview, alerts] = await Promise.all([
    getOverview(supabase, overviewFilters),
    getActiveAlerts(supabase, overviewFilters),
  ]);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Comparativa por red y por negocio de todas tus cuentas conectadas."
      />
      <FilterBar brands={brands ?? []} />

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-6 sm:px-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Alertas</h2>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4"
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
                  alert.severity === "warning"
                    ? "bg-negative-soft text-negative"
                    : "bg-accent-soft text-accent-strong"
                )}
              >
                {alert.severity === "warning" ? "Atención" : "Informativo"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {alert.accounts && <PlatformBadge platform={alert.accounts.platform} />}
                  <h4 className="text-sm font-semibold text-ink-900">{alert.title}</h4>
                </div>
                <p className="mt-0.5 text-sm text-ink-600">{alert.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-3 sm:px-8">
        <StatTile label="Seguidores totales" value={overview.totalFollowers.toLocaleString("es")} />
        <StatTile label="Contenido publicado" value={String(overview.totalContent)} />
        <StatTile label="Engagement promedio" value={pct(overview.avgEngagementRate)} />
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 pb-6 sm:px-8 lg:grid-cols-2">
        <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Crecimiento de seguidores</h3>
          <FollowerGrowthChart data={overview.followerSeries} />
        </div>
        <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Engagement por red</h3>
          <PlatformComparisonChart data={overview.platformComparison} />
        </div>
      </div>

      <div className="px-4 pb-10 sm:px-8">
        <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Mejores publicaciones</h3>
          {overview.topContent.length === 0 ? (
            <p className="text-sm text-ink-400">
              Todavía no hay métricas de contenido — se completa cuando corra el sync (Fase 2).
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {overview.topContent.map((item) => {
                const account = overview.accounts.find((a) => a.id === item.account_id);
                return (
                  <Link
                    key={item.id}
                    href={`/content/${item.id}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:opacity-80"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {account && <PlatformBadge platform={account.platform} />}
                      <p className="truncate text-sm text-ink-900">
                        {item.caption?.slice(0, 60) || "(sin descripción)"}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-medium text-positive">
                      {pct(item.engagementRate)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
