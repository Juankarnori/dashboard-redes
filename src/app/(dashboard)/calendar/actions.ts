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
 * Guarda la cuenta destino, el/los archivo(s) (ya subidos a Supabase
 * Storage directo desde el browser) y el caption de una pieza. Un nuevo
 * attach limpia cualquier intento de publicación previo (error, ids
 * externos) para que la pieza quede lista para un intento limpio.
 *
 * `mediaPaths` con 2+ elementos = carrusel (solo imágenes); con 1
 * elemento se guarda igual que siempre en `media_path`/`media_type` para
 * no tocar el camino feliz del caso simple (foto o video).
 */
export async function attachCalendarMedia(
  calendarItemId: string,
  input: { accountId: string; mediaPaths: string[]; mediaType: "image" | "video"; caption: string }
): Promise<AttachMediaResult> {
  const supabase = await createClient();

  if (input.mediaPaths.length === 0) return { error: "Adjuntá al menos un archivo." };
  if (input.mediaPaths.length > 1 && input.mediaType !== "image") {
    return { error: "Un carrusel solo puede ser de imágenes." };
  }

  const { data: account } = await supabase.from("accounts").select("platform").eq("id", input.accountId).maybeSingle();
  if (!account) return { error: "Cuenta no encontrada." };

  const isCarousel = input.mediaPaths.length > 1;
  const { error } = await supabase
    .from("content_calendar")
    .update({
      account_id: input.accountId,
      platform: account.platform, // se alinea con la cuenta elegida, aunque la pieza no tuviera red definida
      media_path: isCarousel ? null : input.mediaPaths[0],
      media_type: input.mediaType,
      media_paths: isCarousel ? input.mediaPaths : null,
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

export interface CreateFanOutResult {
  error?: string;
  postGroupId?: string;
  itemIds?: string[];
}

/**
 * "Adjunto una vez, publico a varias redes" (Fase 6): crea una fila de
 * content_calendar POR CADA cuenta destino, todas con el mismo
 * post_group_id. Cada fila queda lista para publicarse independiente con
 * startPublish (una cuenta por invocación, como siempre) — si una red
 * falla, las demás del grupo no se tocan.
 */
export async function createFanOutPost(input: {
  brandId: string;
  idea: string;
  caption: string;
  scheduledFor: string; // yyyy-mm-dd
  campaignId?: string | null;
  accountIds: string[];
  mediaPaths: string[];
  mediaType: "image" | "video";
}): Promise<CreateFanOutResult> {
  if (!input.brandId) return { error: "Falta seleccionar un negocio." };
  if (input.accountIds.length === 0) return { error: "Elegí al menos una cuenta destino." };
  if (input.mediaPaths.length === 0) return { error: "Adjuntá al menos un archivo." };
  if (input.mediaPaths.length > 1 && input.mediaType !== "image") {
    return { error: "Un carrusel solo puede ser de imágenes." };
  }
  if (!input.caption.trim()) return { error: "Escribí el texto que se va a publicar." };
  if (!input.scheduledFor) return { error: "Elegí una fecha." };

  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, platform")
    .in("id", input.accountIds)
    .eq("status", "active");
  if (!accounts || accounts.length === 0) return { error: "Ninguna de las cuentas elegidas está activa." };

  const postGroupId = crypto.randomUUID();
  const isCarousel = input.mediaPaths.length > 1;

  const rows = accounts.map((account) => ({
    brand_id: input.brandId,
    idea: input.idea || null,
    scheduled_for: `${input.scheduledFor}T12:00:00`,
    campaign_id: input.campaignId || null,
    platform: account.platform,
    account_id: account.id,
    caption: input.caption,
    media_path: isCarousel ? null : input.mediaPaths[0],
    media_type: input.mediaType,
    media_paths: isCarousel ? input.mediaPaths : null,
    post_group_id: postGroupId,
    status: "planned",
  }));

  const { data: inserted, error } = await supabase.from("content_calendar").insert(rows).select("id");
  if (error) return { error: error.message };

  revalidatePath("/calendar");
  return { postGroupId, itemIds: (inserted ?? []).map((r) => r.id) };
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
    .select("id, account_id, media_path, media_type, media_paths, caption, external_post_id")
    .eq("id", calendarItemId)
    .maybeSingle();
  if (!item) return { error: "Pieza no encontrada." } as const;
  const hasMedia = !!item.media_path || (item.media_paths?.length ?? 0) > 0;
  if (!item.account_id || !hasMedia || !item.media_type) {
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

    // TikTok exige un dominio verificado para las URLs que pullea — el de
    // Supabase Storage no lo es, así que cada archivo pasa por /api/media
    // (nuestro dominio). Meta no tiene esa exigencia y usa la URL directa
    // de Storage. Se aplica a CADA elemento (carrusel incluido).
    const mediaPaths = item.media_paths && item.media_paths.length > 0 ? item.media_paths : [item.media_path!];
    const toMediaUrl = (path: string) =>
      account.platform === "tiktok" ? getProxiedMediaUrl(path) : getCalendarMediaUrl(supabase, path);
    const media = mediaPaths.map((path) => ({
      url: toMediaUrl(path),
      type: item.media_type as "image" | "video",
    }));

    const result = await provider.publishContent({ media, caption }, providerAccount);

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

export interface PostGroupItem {
  id: string;
  platform: Platform;
  accountLabel: string;
  status: string;
  permalink: string | null;
  publishError: string | null;
}

/** Estado de cada red de un post fan-out (mismo post_group_id) — para el panel "publicar a varias redes". */
export async function getPostGroupItems(postGroupId: string): Promise<PostGroupItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_calendar")
    .select("id, platform, status, permalink, publish_error, accounts(display_name, username, platform)")
    .eq("post_group_id", postGroupId);

  const rows = (data ?? []) as unknown as {
    id: string;
    platform: Platform | null;
    status: string;
    permalink: string | null;
    publish_error: string | null;
    accounts: { display_name: string | null; username: string | null; platform: Platform } | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    platform: r.accounts?.platform ?? r.platform ?? "instagram",
    accountLabel: r.accounts?.display_name ?? r.accounts?.username ?? "",
    status: r.status,
    permalink: r.permalink,
    publishError: r.publish_error,
  }));
}
