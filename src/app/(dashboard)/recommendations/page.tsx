import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { GenerateRecsButton } from "@/components/dashboard/GenerateRecsButton";
import { IdeaBoard } from "./IdeaBoard";
import { PromotionForm } from "./PromotionForm";
import { TrendsRefreshForm } from "./TrendsRefreshForm";
import { KIND_LABELS, BOARD_KINDS } from "./constants";

export const dynamic = "force-dynamic";

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const { brand } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");

  const selectedBrandId = brand ?? brands?.[0]?.id;

  const { data: recommendations } = selectedBrandId
    ? await supabase
        .from("recommendations")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("generated_at", { ascending: false })
    : { data: [] };

  const { data: trends } = selectedBrandId
    ? await supabase
        .from("trends")
        .select("*")
        .eq("brand_id", selectedBrandId)
        .order("captured_at", { ascending: false })
    : { data: [] };

  const all = recommendations ?? [];
  const insights = all.filter((rec) => !BOARD_KINDS.includes(rec.kind));
  const ideas = all.filter((rec) => BOARD_KINDS.includes(rec.kind));

  return (
    <>
      <PageHeader
        title="Recomendaciones"
        description="Mejor horario, formatos con más engagement e ideas nuevas, por negocio."
        action={
          selectedBrandId && (
            <div className="flex items-center gap-2">
              <TrendsRefreshForm brandId={selectedBrandId} />
              <PromotionForm brandId={selectedBrandId} />
              <GenerateRecsButton brandId={selectedBrandId} />
            </div>
          )
        }
      />
      <FilterBar brands={brands ?? []} />

      <div className="flex flex-col gap-8 px-4 py-6 sm:px-8">
        {!selectedBrandId ? (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
            Crea un negocio primero en Cuentas.
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Insights</h2>
              {insights.length === 0 ? (
                <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
                  Sin recomendaciones todavía. Necesitas contenido sincronizado con métricas
                  (Fase 2) antes de generar — luego usa el botón de arriba.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {insights.map((rec) => (
                    <div key={rec.id} className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
                      <span className="text-xs font-medium uppercase tracking-wide text-accent">
                        {KIND_LABELS[rec.kind] ?? rec.kind}
                      </span>
                      <h3 className="mt-1.5 text-sm font-semibold text-ink-900">{rec.title}</h3>
                      <p className="mt-1.5 text-sm text-ink-600">{rec.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                Tendencias esta semana
              </h2>
              {!trends || trends.length === 0 ? (
                <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
                  Sin tendencias todavía. Usa &quot;Actualizar tendencias&quot; en el header, arriba.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {trends.map((trend) => (
                    <div key={trend.id} className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
                      <h3 className="text-sm font-semibold text-ink-900">{trend.topic}</h3>
                      {trend.summary && <p className="mt-1.5 text-sm text-ink-600">{trend.summary}</p>}
                      {trend.source_url && (
                        <a
                          href={trend.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
                        >
                          Ver fuente →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-600">Banco de ideas</h2>
              <IdeaBoard ideas={ideas} />
            </section>
          </>
        )}
      </div>
    </>
  );
}
