import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedSyncRequest } from "@/lib/sync-auth";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { getProvider } from "@/lib/platforms";
import { recomputeAccountAlerts } from "@/lib/analytics/alerts";
import { syncCommentsForAccount } from "@/lib/analytics/comments-sync";
import type { ProviderContentItem } from "@/lib/platforms/types";

type SyncScope = "all" | "stories" | "comments";

function parseScope(value: string | null): SyncScope {
  if (value === "stories") return "stories";
  if (value === "comments") return "comments";
  return "all";
}

/**
 * Sincroniza UNA cuenta por invocación (elegida por account_id) — así
 * cada llamada cabe cómoda en el timeout de 10s de Vercel Hobby, sin
 * importar cuántas cuentas haya en total. El GitHub Action itera sobre
 * /api/sync/accounts y llama esto una vez por cuenta.
 *
 * POST /api/sync?account_id=<uuid>&scope=all|stories|comments
 *   scope=all (default): posts/reels + audiencia.
 *   scope=stories: solo historias activas (para el cron más frecuente).
 *   scope=comments: comentarios del contenido publicado recientemente
 *     (ver COMMENTS_LOOKBACK_DAYS en lib/analytics/comments-sync.ts) —
 *     pensado para un cron más frecuente que el de "all" pero no tan
 *     seguido como el de historias.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedSyncRequest(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accountId = request.nextUrl.searchParams.get("account_id");
  const scope = parseScope(request.nextUrl.searchParams.get("scope"));
  if (!accountId) {
    return NextResponse.json({ error: "Falta account_id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .eq("status", "active")
    .maybeSingle();

  if (accountError || !account) {
    return NextResponse.json({ error: "Cuenta no encontrada o inactiva" }, { status: 404 });
  }

  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({ account_id: account.id, status: "running" })
    .select("id")
    .single();

  try {
    const provider = getProvider(account.platform);
    const accessToken = decryptToken(account.access_token);
    const refreshToken = account.refresh_token ? decryptToken(account.refresh_token) : undefined;
    const providerAccount = {
      id: account.id,
      externalId: account.external_id,
      accessToken,
      refreshToken,
      tokenExpiresAt: account.token_expires_at,
    };

    // Refresh de token (solo redes con tokens de corta duración, ej.
    // TikTok — ver PlatformProvider.refreshTokenIfNeeded). Se hace antes
    // de cualquier llamada a la API para no arrancar el sync con un
    // token que sabemos vencido.
    if (provider.refreshTokenIfNeeded) {
      try {
        const refreshed = await provider.refreshTokenIfNeeded(providerAccount);
        if (refreshed) {
          // Update único con los tres campos juntos: la fila se actualiza
          // de forma atómica, nunca queda un access_token nuevo con el
          // refresh_token viejo (o viceversa) a medio camino.
          const { error: refreshSaveError } = await supabase
            .from("accounts")
            .update({
              access_token: encryptToken(refreshed.accessToken),
              refresh_token: encryptToken(refreshed.refreshToken),
              token_expires_at: refreshed.expiresAt,
            })
            .eq("id", account.id);

          if (refreshSaveError) {
            throw new Error(`Token refrescado pero no se pudo guardar: ${refreshSaveError.message}`);
          }

          providerAccount.accessToken = refreshed.accessToken;
          providerAccount.refreshToken = refreshed.refreshToken;
          providerAccount.tokenExpiresAt = refreshed.expiresAt;
        }
      } catch (err) {
        // Nunca fallar en silencio: se loguea acá con marca explícita de
        // "refresh" (para diferenciarlo de un error de fetch de contenido)
        // y se relanza para que el catch de abajo lo registre en sync_logs.
        console.error(`[token-refresh] Falló el refresh de token (${account.platform}) para cuenta ${account.id}:`, err);
        throw err;
      }
    }

    if (scope === "comments") {
      const synced = await syncCommentsForAccount(supabase, provider, providerAccount, account.id);
      if (syncLog) {
        await supabase
          .from("sync_logs")
          .update({ finished_at: new Date().toISOString(), status: "ok", items_synced: synced })
          .eq("id", syncLog.id);
      }
      return NextResponse.json({ ok: true, account_id: account.id, scope, items_synced: synced });
    }

    let items: ProviderContentItem[] = [];
    if (scope === "stories") {
      items = provider.fetchStories ? await provider.fetchStories(providerAccount) : [];
    } else {
      items = await provider.fetchContent(providerAccount);
    }

    let synced = 0;
    for (const item of items) {
      const { data: content, error: contentError } = await supabase
        .from("content")
        .upsert(
          {
            account_id: account.id,
            external_id: item.externalId,
            type: item.type,
            caption: item.caption ?? null,
            media_url: item.mediaUrl ?? null,
            thumbnail_url: item.thumbnailUrl ?? null,
            permalink: item.permalink ?? null,
            published_at: item.publishedAt ?? null,
            expires_at: item.expiresAt ?? null,
          },
          { onConflict: "account_id,external_id" }
        )
        .select("id")
        .single();

      if (contentError || !content) {
        console.error(`No se pudo guardar content ${item.externalId}:`, contentError);
        continue;
      }

      await supabase.from("content_metrics").insert({
        content_id: content.id,
        reach: item.metrics.reach ?? null,
        impressions: item.metrics.impressions ?? null,
        likes: item.metrics.likes ?? null,
        comments: item.metrics.comments ?? null,
        shares: item.metrics.shares ?? null,
        saves: item.metrics.saves ?? null,
        metrics: item.metrics.extra ?? {},
      });
      synced++;
    }

    if (scope === "all") {
      const audience = await provider.fetchAudience(providerAccount);
      await supabase.from("audience_snapshot").insert({
        account_id: account.id,
        followers: audience.followers ?? null,
        follows: audience.follows ?? null,
        media_count: audience.mediaCount ?? null,
        demographics: audience.demographics ?? {},
      });

      // No fatal: si falla el cálculo de alertas, el sync ya guardó todo
      // lo importante (contenido, métricas, audiencia) y no debe reportarse
      // como error por esto.
      try {
        await recomputeAccountAlerts(supabase, {
          id: account.id,
          brand_id: account.brand_id,
          label: account.display_name ?? account.username ?? account.platform,
        });
      } catch (err) {
        console.error(`No se pudieron recalcular alertas para ${account.id}:`, err);
      }
    }

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({ finished_at: new Date().toISOString(), status: "ok", items_synced: synced })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({ ok: true, account_id: account.id, scope, items_synced: synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Sync falló para cuenta ${account.id}:`, err);

    if (syncLog) {
      await supabase
        .from("sync_logs")
        .update({ finished_at: new Date().toISOString(), status: "error", error: message })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
