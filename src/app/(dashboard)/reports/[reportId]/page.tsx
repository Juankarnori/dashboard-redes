import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";

export const dynamic = "force-dynamic";

function fmtWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("es", opts)} – ${end.toLocaleDateString("es", opts)}`;
}

interface ReportMetrics {
  contentCount?: number;
  totalReach?: number;
  reachChangePct?: number | null;
  bestPostContentId?: string | null;
  bestPostEngagementRate?: number | null;
  formatWinner?: string | null;
  bestDay?: string | null;
  bestHour?: number | null;
  unansweredComments?: number;
  unansweredLeads?: number;
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("id, week_start, body, metrics, brands(name, color)")
    .eq("id", reportId)
    .maybeSingle();

  if (!report) notFound();

  const brand = report.brands as unknown as { name: string; color: string } | null;
  const metrics = (report.metrics ?? {}) as ReportMetrics;

  return (
    <>
      <PageHeader
        title={brand?.name ?? "Reporte"}
        description={`Semana del ${fmtWeek(report.week_start)}`}
      />

      <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
        <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-900">{report.body}</p>
          {metrics.bestPostContentId && (
            <Link
              href={`/content/${metrics.bestPostContentId}`}
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              Ver el mejor post de la semana →
            </Link>
          )}
        </div>

        {metrics.contentCount !== undefined && metrics.contentCount > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Piezas publicadas" value={String(metrics.contentCount)} />
            <StatTile label="Alcance total" value={(metrics.totalReach ?? 0).toLocaleString("es")} />
            <StatTile
              label="vs. semana previa"
              value={
                metrics.reachChangePct === null || metrics.reachChangePct === undefined
                  ? "—"
                  : `${metrics.reachChangePct >= 0 ? "+" : ""}${(metrics.reachChangePct * 100).toFixed(0)}%`
              }
            />
            <StatTile
              label="Mejor post"
              value={
                metrics.bestPostEngagementRate !== null && metrics.bestPostEngagementRate !== undefined
                  ? `${(metrics.bestPostEngagementRate * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </div>
        )}

        <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-6 text-center text-xs text-ink-400">
          Reporte generado automáticamente con reglas y estadística sobre tus datos — sin IA.
        </div>
      </div>
    </>
  );
}
