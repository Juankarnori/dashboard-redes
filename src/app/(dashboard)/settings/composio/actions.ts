"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getComposioClient } from "@/lib/social/client";
import { getOrCreateManagedAuthConfig, getOrCreateTikTokAuthConfig } from "@/lib/social/connections";
import type { Platform } from "@/types/db";

export interface InitiateConnectionResult {
  error?: string;
  redirectUrl?: string;
  connectedAccountId?: string;
}

/**
 * Arranca una conexión de Composio para un negocio+red. Devuelve el link
 * de autorización para que el dueño lo abra y complete el OAuth — no
 * podemos completar eso por él desde acá (ver confirmComposioConnection,
 * que se llama después de que vuelva).
 */
export async function initiateComposioConnection(
  brandId: string,
  platform: Platform
): Promise<InitiateConnectionResult> {
  if (!brandId) return { error: "Falta seleccionar un negocio." };

  try {
    const authConfigId =
      platform === "tiktok" ? await getOrCreateTikTokAuthConfig() : await getOrCreateManagedAuthConfig(platform);

    const composio = getComposioClient();
    // brandId como "userId" de Composio: agrupa las conexiones de un
    // mismo negocio bajo un mismo dueño lógico en Composio — no hay
    // multi-tenant real acá (un solo dueño), así que alcanza.
    //
    // .link(), no .initiate(): confirmado en vivo (no solo leyendo el
    // código) que .initiate() ya está deprecado en el backend de
    // Composio para auth configs administrados por Composio — devuelve
    // 400 "no longer supported... Use POST /api/v3/connected_accounts/
    // link instead". Mismo shape de retorno, mismo allowMultiple.
    const connectionRequest = await composio.connectedAccounts.link(brandId, authConfigId, {
      allowMultiple: true, // el negocio puede tener más de una cuenta de la misma red (ver Farmasi + Copiadora)
    });

    return { redirectUrl: connectionRequest.redirectUrl ?? undefined, connectedAccountId: connectionRequest.id };
  } catch (err) {
    console.error(`No se pudo iniciar la conexión de Composio (${platform}) para brand ${brandId}:`, err);
    return { error: err instanceof Error ? err.message : "No se pudo iniciar la conexión." };
  }
}

export interface ConfirmConnectionResult {
  error?: string;
  status?: string;
}

/**
 * Se llama después de que el dueño vuelve de autorizar en Meta/TikTok.
 * Si Composio ya la marca ACTIVE, la guarda en composio_connections.
 */
export async function confirmComposioConnection(
  brandId: string,
  platform: Platform,
  connectedAccountId: string,
  alias?: string
): Promise<ConfirmConnectionResult> {
  try {
    const composio = getComposioClient();
    const account = await composio.connectedAccounts.get(connectedAccountId);

    if (account.status !== "ACTIVE") {
      return { status: account.status, error: `La conexión todavía no está activa (status: ${account.status}).` };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("composio_connections").upsert(
      {
        brand_id: brandId,
        platform,
        composio_user_id: brandId,
        composio_connected_account_id: connectedAccountId,
        alias: alias || null,
        status: "active",
      },
      { onConflict: "platform,composio_connected_account_id" }
    );
    if (error) return { error: error.message };

    revalidatePath("/settings/composio");
    return { status: "ACTIVE" };
  } catch (err) {
    console.error(`No se pudo confirmar la conexión de Composio ${connectedAccountId}:`, err);
    return { error: err instanceof Error ? err.message : "No se pudo confirmar la conexión." };
  }
}
