import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const dynamic = "force-dynamic";

function fmtWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("es", opts)} – ${end.toLocaleDateString("es", opts)}`;
}

export default async function ReportsPage() {
  const supabase = await createClient();

  // RLS ("owner reads own reports") ya filtra a los negocios del dueño —
  // no hace falta un FilterBar de brand/platform como el resto del
  // dashboard (los reportes no tienen dimensión de red).
  const { data: reports } = await supabase
    .from("reports")
    .select("id, brand_id, week_start, body, brands(name, color)")
    .order("week_start", { ascending: false });

  const rows = (reports ?? []) as unknown as {
    id: string;
    brand_id: string;
    week_start: string;
    body: string;
    brands: { name: string; color: string } | null;
  }[];

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Resumen semanal por negocio, generado automáticamente cada lunes — sin IA."
      />

      <div className="px-4 py-6 sm:px-8">
        {rows.length === 0 ? (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
            Todavía no hay reportes. Se generan automáticamente cada lunes (ver{" "}
            <code>.github/workflows/weekly-report.yml</code>), o podés disparar uno a mano con{" "}
            <code>POST /api/reports/weekly</code>.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((report) => (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="block rounded-[--radius-card] border border-border bg-surface-1 p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {report.brands && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: report.brands.color }}
                      />
                      {report.brands.name}
                    </span>
                  )}
                  <span className="text-xs text-ink-400">{fmtWeek(report.week_start)}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink-600">{report.body}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
