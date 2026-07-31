"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Platform } from "@/types/db";

export interface FormState {
  error?: string;
}

export async function createCampaign(_prevState: FormState, formData: FormData): Promise<FormState> {
  const brandId = String(formData.get("brand_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const objective = String(formData.get("objective") ?? "").trim();

  if (!brandId) return { error: "Falta seleccionar un negocio." };
  if (!name) return { error: "Ponle un nombre a la campaña." };
  if (!startDate || !endDate) return { error: "Faltan las fechas de inicio y fin." };
  if (endDate < startDate) return { error: "La fecha de fin no puede ser anterior a la de inicio." };

  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    brand_id: brandId,
    name,
    objective: objective || null,
    start_date: startDate,
    end_date: endDate,
  });

  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}

export async function createCalendarItem(_prevState: FormState, formData: FormData): Promise<FormState> {
  const brandId = String(formData.get("brand_id") ?? "");
  const idea = String(formData.get("idea") ?? "").trim();
  const scheduledFor = String(formData.get("scheduled_for") ?? "");
  const platform = String(formData.get("platform") ?? "") || null;
  const campaignId = String(formData.get("campaign_id") ?? "") || null;

  if (!brandId) return { error: "Falta seleccionar un negocio." };
  if (!idea) return { error: "Escribe una idea para esta pieza." };
  if (!scheduledFor) return { error: "Elegí una fecha." };

  const supabase = await createClient();
  const { error } = await supabase.from("content_calendar").insert({
    brand_id: brandId,
    idea,
    // Mediodía local fijo: evita que la pieza "salte" de día por husos
    // horarios al comparar solo la parte de fecha en el grid.
    scheduled_for: `${scheduledFor}T12:00:00`,
    platform: platform as Platform | null,
    campaign_id: campaignId,
    status: "planned",
  });

  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}

export interface RescheduleResult {
  error?: string;
}

/** Reprograma una pieza a otro día (drag-and-drop o el input de fecha de respaldo). */
export async function rescheduleCalendarItem(id: string, newDate: string): Promise<RescheduleResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_calendar")
    .update({ scheduled_for: `${newDate}T12:00:00` })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}
