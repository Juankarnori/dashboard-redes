"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/crypto";
import { getProvider } from "@/lib/platforms";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { getCalendarMediaUrl, getProxiedMediaUrl } from "@/lib/supabase/storage";
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

export interface AttachMediaResult {
  error?: string;
}

/**
 * Guarda la cuenta destino, el archivo (ya subido a Supabase Storage
 * directo desde el browser) y el caption de una pieza. Un nuevo attach
 * limpia cualquier intento de publicación previo (error, ids externos)
 * para que la pieza quede lista para un intento limpio.
 */
export async function attachCalendarMedia(
  calendarItemId: string,
  input: { accountId: string; mediaPath: string; mediaType: "image" | "video"; caption: string }
): Promise<AttachMediaResult> {
  const supabase = await createClient();

  const { data: account } = await supabase.from("accounts").select("platform").eq("id", input.accountId).maybeSingle();
  if (!account) return { error: "Cuenta no encontrada." };

  const { error } = await supabase
    .from("content_calendar")
    .update({
      account_id: input.accountId,
      platform: account.platform, // se alinea con la cuenta elegida, aunque la pieza no tuviera red definida
      media_path: input.mediaPath,
      media_type: input.mediaType,
      caption: input.caption,
      status: "planned",
      publish_error: null,
      external_post_id: null,
      permalink: null,
      published_at: null,
    })
    .eq("id", calendarItemId);

  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return {};
}

export interface PublishActionResult {
  error?: string;
  status?: "publishing" | "published" | "draft_sent" | "failed";
  permalink?: string;
}

/** Carga la pieza + su cuenta destino, ya validadas para publicar. */
async function loadPublishableItem(supabase: Awaited<ReturnType<typeof createClient>>, calendarItemId: string) {
  const { data: item } = await supabase
    .from("content_calendar")
    .select("id, account_id, media_path, media_type, caption, external_post_id")
    .eq("id", calendarItemId)
    .maybeSingle();
  if (!item) return { error: "Pieza no encontrada." } as const;
  if (!item.account_id || !item.media_path || !item.media_type) {
    return { error: "Faltan la cuenta y/o el archivo antes de poder publicar." } as const;
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", item.account_id)
    .eq("status", "active")
    .maybeSingle();
  if (!account) return { error: "La cuenta destino no está conectada o está inactiva." } as const;

  return { item, account } as const;
}

async function markFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  calendarItemId: string,
  err: unknown
): Promise<PublishActionResult> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`No se pudo publicar la pieza ${calendarItemId}:`, err);
  await supabase.from("content_calendar").update({ status: "failed", publish_error: message }).eq("id", calendarItemId);
  revalidatePath("/calendar");
  return { error: message, status: "failed" };
}

/**
 * Dispara la publicación real. Para video de Instagram, Meta procesa el
 * container de forma asíncrona y puede tardar más que el timeout de una
 * función serverless (Vercel Hobby, 10s) — por eso esto puede volver con
 * status="publishing" sin haber terminado; el cliente sigue con
 * pollPublishStatus en un loop corto, mismo patrón que ya usamos para el
 * envío masivo de plantillas en /comments.
 */
export async function startPublish(calendarItemId: string): Promise<PublishActionResult> {
  const supabase = await createClient();
  const loaded = await loadPublishableItem(supabase, calendarItemId);
  if ("error" in loaded) return { error: loaded.error };
  const { item, account } = loaded;

  const caption = item.caption ?? "";
  if (account.platform !== "tiktok" && !caption.trim()) {
    return { error: "Escribí el texto que se va a publicar." };
  }

  const provider = getProvider(account.platform);
  if (!provider.publishContent) {
    return { error: `Publicar todavía no está soportado para ${account.platform}.` };
  }

  await supabase.from("content_calendar").update({ status: "publishing", publish_error: null }).eq("id", calendarItemId);

  try {
    const accessToken = decryptToken(account.access_token);
    const refreshToken = account.refresh_token ? decryptToken(account.refresh_token) : undefined;
    const providerAccount = await refreshAccountTokenIfNeeded(
      supabase,
      provider,
      {
        id: account.id,
        externalId: account.external_id,
        accessToken,
        refreshToken,
        tokenExpiresAt: account.token_expires_at,
      },
      account.id
    );

    // TikTok exige un dominio verificado para video_url — el de Supabase
    // Storage no lo es, así que pasa por /api/media (nuestro dominio).
    // Meta no tiene esa exigencia y usa la URL directa de Storage.
    const mediaUrl =
      account.platform === "tiktok" ? getProxiedMediaUrl(item.media_path!) : getCalendarMediaUrl(supabase, item.media_path!);
    const result = await provider.publishContent(
      { mediaUrl, mediaType: item.media_type as "image" | "video", caption },
      providerAccount
    );

    return await savePublishResult(supabase, calendarItemId, result);
  } catch (err) {
    return markFailed(supabase, calendarItemId, err);
  }
}

/** Pollea el estado de un container de Instagram en curso (ver startPublish). Solo aplica a Instagram. */
export async function pollPublishStatus(calendarItemId: string): Promise<PublishActionResult> {
  const supabase = await createClient();
  const loaded = await loadPublishableItem(supabase, calendarItemId);
  if ("error" in loaded) return { error: loaded.error };
  const { item, account } = loaded;

  if (!item.external_post_id) return { error: "No hay una publicación en curso para esta pieza." };

  const provider = getProvider(account.platform);
  if (!provider.checkPublishStatus) {
    return { error: `Consultar estado de publicación no aplica para ${account.platform}.` };
  }

  try {
    const accessToken = decryptToken(account.access_token);
    const providerAccount = { id: account.id, externalId: account.external_id, accessToken };
    const result = await provider.checkPublishStatus(item.external_post_id, providerAccount);
    return await savePublishResult(supabase, calendarItemId, result);
  } catch (err) {
    return markFailed(supabase, calendarItemId, err);
  }
}

async function savePublishResult(
  supabase: Awaited<ReturnType<typeof createClient>>,
  calendarItemId: string,
  result: { kind: "published"; externalId: string; permalink?: string } | { kind: "processing"; containerId: string } | { kind: "draft_sent"; externalId: string }
): Promise<PublishActionResult> {
  if (result.kind === "processing") {
    await supabase
      .from("content_calendar")
      .update({ status: "publishing", external_post_id: result.containerId })
      .eq("id", calendarItemId);
    revalidatePath("/calendar");
    return { status: "publishing" };
  }

  if (result.kind === "draft_sent") {
    await supabase
      .from("content_calendar")
      .update({ status: "draft_sent", external_post_id: result.externalId })
      .eq("id", calendarItemId);
    revalidatePath("/calendar");
    return { status: "draft_sent" };
  }

  await supabase
    .from("content_calendar")
    .update({
      status: "published",
      external_post_id: result.externalId,
      permalink: result.permalink ?? null,
      published_at: new Date().toISOString(),
    })
    .eq("id", calendarItemId);
  revalidatePath("/calendar");
  return { status: "published", permalink: result.permalink };
}
