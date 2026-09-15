import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { FormatComparisonChart } from "@/components/charts/FormatComparisonChart";
import { getContentForAnalysis, getAccountComparison, getFilteredAccounts, getTrendSeries } from "@/lib/analytics/queries";
import { bestPostingTimes, formatComparison } from "@/lib/analytics/recommendations";
import { BestTimeHeatmap } from "./BestTimeHeatmap";
import { AccountComparator } from "./AccountComparator";
import { TrendChart } from "@/components/charts/TrendChart";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string }>;
}) {
  const { brand, platform } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");

  const filters = { brandId: brand, platform: platform as Platform | undefined };

  const accounts = await getFilteredAccounts(supabase, filters);
  const accountIds = accounts.map((a) => a.id);

  const [items, accountComparison, trendSeries] = await Promise.all([
    getContentForAnalysis(supabase, accountIds),
    getAccountComparison(supabase, filters),
    getTrendSeries(supabase, filters),
  ]);

  // minSamples=1 (en vez del 2 que usa la recomendación de "mejor horario")
  // porque el heatmap quiere mostrar toda la señal disponible, no solo las
  // franjas con suficiente muestra para recomendar con confianza.
  const heatmapSlots = bestPostingTimes(items, 1);
  const formats = formatComparison(items);

  return (
    <>
      <PageHeader
        title="Análisis"
        description="Mejor horario, formato con más engagement y comparativa entre tus cuentas."
      />
      <FilterBar brands={brands ?? []} />

      <div className="flex flex-col gap-8 px-4 py-6 sm:px-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Tendencia (alcance / vistas e interacciones)</h2>
          <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
            <TrendChart data={trendSeries} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Mejor horario</h2>
          <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
            <BestTimeHeatmap slots={heatmapSlots} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Engagement por formato</h2>
          <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
            <FormatComparisonChart data={formats} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Comparar cuentas</h2>
          <AccountComparator groups={accountComparison} />
        </section>
      </div>
    </>
  );
}
