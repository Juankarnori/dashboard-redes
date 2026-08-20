import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSyncRequest } from "@/lib/sync-auth";
import { getContentForAnalysisInRange, getUnansweredCommentStats } from "@/lib/analytics/queries";
import { computeReportWeek, buildWeeklyReport } from "@/lib/analytics/weekly-report";

/**
 * POST /api/reports/weekly — genera (o re-genera) el reporte semanal de
 * cada negocio, con plantillas de string en TypeScript (sin IA — ver
 * weekly-report.ts). Pensado para un cron semanal (lunes), pero a
 * diferencia de /api/sync procesa TODOS los negocios en una sola
 * invocación: no hay llamadas a APIs externas acá, solo queries a
 * Supabase + CPU, así que cabe cómodo en el timeout de 10s de Vercel
 * Hobby aunque haya varios negocios.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { weekStart, weekEnd, previousWeekStart, previousWeekEnd } = computeReportWeek(new Date());
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();
  const previousWeekStartISO = previousWeekStart.toISOString();
  const previousWeekEndISO = previousWeekEnd.toISOString();
  const weekStartDate = weekStartISO.slice(0, 10); // date (sin hora) — así es la columna week_start

  const { data: brands, error: brandsError } = await supabase.from("brands").select("id, name");
  if (brandsError) {
    return NextResponse.json({ error: brandsError.message }, { status: 500 });
  }

  const results: { brand_id: string; ok: boolean; error?: string }[] = [];

  for (const brand of brands ?? []) {
    try {
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id")
        .eq("brand_id", brand.id)
        .eq("status", "active");
      const accountIds = (accounts ?? []).map((a) => a.id);

      const [currentWeekContent, previousWeekContent, commentStats] = await Promise.all([
        getContentForAnalysisInRange(supabase, accountIds, weekStartISO, weekEndISO),
        getContentForAnalysisInRange(supabase, accountIds, previousWeekStartISO, previousWeekEndISO),
        getUnansweredCommentStats(supabase, accountIds),
      ]);

      const { body, metrics } = buildWeeklyReport({
        brandName: brand.name,
        weekStart,
        weekEnd,
        currentWeekContent,
        previousWeekContent,
        unansweredComments: commentStats.total,
        unansweredLeads: commentStats.leads,
      });

      const { error: upsertError } = await supabase
        .from("reports")
        .upsert(
          { brand_id: brand.id, week_start: weekStartDate, body, metrics },
          { onConflict: "brand_id,week_start" }
        );

      if (upsertError) throw new Error(upsertError.message);
      results.push({ brand_id: brand.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[reports/weekly] Falló el reporte del negocio ${brand.id}:`, err);
      results.push({ brand_id: brand.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ ok: true, week_start: weekStartDate, results });
}
