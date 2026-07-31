"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContentForAnalysis } from "@/lib/analytics/queries";
import { bestPostingTimes, formatComparison, topPerformers } from "@/lib/analytics/recommendations";
import { engagementRate } from "@/lib/analytics/engagement";
import { generateContentIdeas, generatePromotionVariants, fetchTrendingTopics } from "@/lib/anthropic/client";
import type { RecommendationStatus } from "@/types/db";

export interface GenerateRecsState {
  error?: string;
}

export async function generateRecommendations(
  _prevState: GenerateRecsState,
  formData: FormData
): Promise<GenerateRecsState> {
  const brandId = String(formData.get("brand_id") ?? "");
  if (!brandId) return { error: "Falta seleccionar un negocio." };

  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).maybeSingle();
  if (!brand) return { error: "Negocio no encontrado." };

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, platform")
    .eq("brand_id", brandId)
    .eq("status", "active");

  const accountIds = (accounts ?? []).map((a) => a.id);
  const items = await getContentForAnalysis(supabase, accountIds);
  const platformByAccount = new Map((accounts ?? []).map((a) => [a.id, a.platform]));

  const bestTimes = bestPostingTimes(items);
  const formats = formatComparison(items);
  const top = topPerformers(items);

  // Reemplaza las recomendaciones "calculadas" anteriores de este negocio
  // (best_time / top_format) — content_idea se acumula como historial.
  await supabase.from("recommendations").delete().eq("brand_id", brandId).in("kind", ["best_time", "top_format"]);

  const rows = [];
  if (bestTimes.length > 0) {
    const top3 = bestTimes.slice(0, 3);
    rows.push({
      brand_id: brandId,
      kind: "best_time",
      title: `Mejor momento: ${top3[0].dayLabel} ${top3[0].hour}:00`,
      body: top3
        .map((t) => `${t.dayLabel} ${t.hour}:00 — ${(t.avgEngagementRate * 100).toFixed(1)}% engagement (${t.sampleSize} posts)`)
        .join(" · "),
      data: { slots: top3 },
    });
  }
  if (formats.length > 0) {
    rows.push({
      brand_id: brandId,
      kind: "top_format",
      title: `Mejor formato: ${formats[0].type}`,
      body: formats
        .map((f) => `${f.type} — ${(f.avgEngagementRate * 100).toFixed(1)}% (${f.sampleSize} piezas)`)
        .join(" · "),
      data: { formats },
    });
  }
  if (rows.length > 0) {
    await supabase.from("recommendations").insert(rows);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { data: trendRows } = await supabase
        .from("trends")
        .select("topic, summary")
        .eq("brand_id", brandId)
        .order("captured_at", { ascending: false });

      const ideas = await generateContentIdeas(
        brand.name,
        top.map((t) => ({
          caption: t.content.caption ?? undefined,
          type: t.content.type,
          platform: platformByAccount.get(t.content.account_id) ?? "instagram",
          engagementRatePct: (t.latestMetrics ? engagementRate(t.latestMetrics) ?? 0 : 0) * 100,
        })),
        (trendRows ?? []).map((t) => ({ topic: t.topic, summary: t.summary ?? undefined }))
      );
      if (ideas.length > 0) {
        await supabase.from("recommendations").insert(
          ideas.map((idea) => ({
            brand_id: brandId,
            kind: "content_idea",
            title: idea.title,
            body: idea.body,
            data: {},
          }))
        );
      }
    } catch (err) {
      console.error("Claude content ideas falló:", err);
      return { error: "Se calcularon horario y formato, pero Claude no generó ideas nuevas." };
    }
  }

  revalidatePath("/recommendations");
  return {};
}

export interface GeneratePromotionState {
  error?: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Genera 3-5 variantes de copy de promoción y las guarda como recommendations (kind=promotion). */
export async function generatePromotion(
  _prevState: GeneratePromotionState,
  formData: FormData
): Promise<GeneratePromotionState> {
  const brandId = String(formData.get("brand_id") ?? "");
  const product = String(formData.get("product") ?? "").trim();
  const objective = String(formData.get("objective") ?? "").trim();

  if (!brandId) return { error: "Falta seleccionar un negocio." };
  if (!product) return { error: "Decime qué vas a promocionar." };
  if (!objective) return { error: "Elegí o escribí un objetivo." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Falta configurar ANTHROPIC_API_KEY." };

  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).maybeSingle();
  if (!brand) return { error: "Negocio no encontrado." };

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, platform")
    .eq("brand_id", brandId)
    .eq("status", "active");

  const platforms = Array.from(new Set((accounts ?? []).map((a) => a.platform)));
  if (platforms.length === 0) {
    return { error: "Este negocio no tiene cuentas conectadas todavía." };
  }

  const accountIds = (accounts ?? []).map((a) => a.id);
  const platformByAccount = new Map((accounts ?? []).map((a) => [a.id, a.platform]));
  const items = await getContentForAnalysis(supabase, accountIds);
  const top = topPerformers(items);

  try {
    const variants = await generatePromotionVariants(
      brand.name,
      product,
      objective,
      platforms,
      top.map((t) => ({
        caption: t.content.caption ?? undefined,
        type: t.content.type,
        platform: platformByAccount.get(t.content.account_id) ?? "instagram",
        engagementRatePct: (t.latestMetrics ? engagementRate(t.latestMetrics) ?? 0 : 0) * 100,
      }))
    );

    if (variants.length === 0) {
      return { error: "Claude no devolvió variantes válidas. Intentá de nuevo." };
    }

    const { error } = await supabase.from("recommendations").insert(
      variants.map((v) => ({
        brand_id: brandId,
        kind: "promotion",
        title: `${capitalize(v.platform)} — ${v.title}`,
        body: v.body,
        data: { platform: v.platform, product, objective },
      }))
    );

    if (error) return { error: error.message };
  } catch (err) {
    console.error("Generación de promoción falló:", err);
    return { error: "No se pudieron generar las promociones. Intentá de nuevo." };
  }

  revalidatePath("/recommendations");
  return {};
}

export interface RefreshTrendsState {
  error?: string;
}

/** Busca tendencias actuales del nicho vía web search y reemplaza las anteriores del negocio. */
export async function refreshTrends(
  _prevState: RefreshTrendsState,
  formData: FormData
): Promise<RefreshTrendsState> {
  const brandId = String(formData.get("brand_id") ?? "");
  const niche = String(formData.get("niche") ?? "").trim();

  if (!brandId) return { error: "Falta seleccionar un negocio." };
  if (!niche) return { error: "Decime el nicho/contexto del negocio." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Falta configurar ANTHROPIC_API_KEY." };

  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).maybeSingle();
  if (!brand) return { error: "Negocio no encontrado." };

  try {
    const trends = await fetchTrendingTopics(brand.name, niche);
    if (trends.length === 0) {
      return { error: "Claude no devolvió tendencias válidas. Intentá de nuevo." };
    }

    await supabase.from("trends").delete().eq("brand_id", brandId);

    const { error } = await supabase.from("trends").insert(
      trends.map((t) => ({
        brand_id: brandId,
        topic: t.topic,
        summary: t.summary,
        source_url: t.sourceUrl ?? null,
      }))
    );

    if (error) return { error: error.message };
  } catch (err) {
    console.error("Búsqueda de tendencias falló:", err);
    return { error: "No se pudieron buscar tendencias. Intentá de nuevo." };
  }

  revalidatePath("/recommendations");
  return {};
}

export interface UpdateRecStatusResult {
  error?: string;
}

/** Mueve una idea/promoción entre columnas del kanban (pending/in_progress/published). */
export async function updateRecommendationStatus(
  id: string,
  status: RecommendationStatus
): Promise<UpdateRecStatusResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("recommendations").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/recommendations");
  return {};
}
