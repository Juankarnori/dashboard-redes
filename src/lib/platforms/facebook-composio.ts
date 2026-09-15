import type { PlatformProvider, ProviderAccount, ProviderAudienceSnapshot, ProviderContentItem } from "./types";
import {
  getFacebookPages,
  getFacebookPageProfile,
  getFacebookPageInsights,
  getFacebookPagePosts,
  getFacebookPostViews,
} from "@/lib/social/facebook";

/**
 * Facebook vía Composio — mismo patrón que instagram-composio.ts. Una
 * cuenta conectada puede administrar varias Páginas (ver
 * lib/social/facebook.ts); igual que en /settings/composio, se usa la
 * primera que devuelve getFacebookPages (la única que administra este
 * negocio hoy).
 */
function requireComposio(account: ProviderAccount) {
  if (!account.composio) {
    throw new Error(`Cuenta ${account.id}: facebookComposioProvider requiere account.composio (userId+connectedAccountId).`);
  }
  return account.composio;
}

async function resolvePageId(userId: string, connectedAccountId: string, accountExternalId: string): Promise<string> {
  const pages = await getFacebookPages(userId, connectedAccountId);
  // Preferí la Página cuyo id matchea accounts.external_id (la misma que
  // ya usa la integración directa) — si por algún motivo no aparece,
  // caé a la primera que devuelva Composio en vez de fallar.
  return pages.find((p) => p.id === accountExternalId)?.id ?? pages[0]?.id ?? accountExternalId;
}

export const facebookComposioProvider: PlatformProvider = {
  platform: "facebook",

  async fetchContent(account: ProviderAccount): Promise<ProviderContentItem[]> {
    const { userId, connectedAccountId } = requireComposio(account);
    const pageId = await resolvePageId(userId, connectedAccountId, account.externalId);
    const posts = await getFacebookPagePosts(userId, connectedAccountId, pageId, 25);

    // post_media_view (vistas) es el único metric que Meta todavía
    // expone a nivel de post desde nov-2025 (ver getFacebookPostViews) —
    // se mapea a "impressions", no "reach" (esa métrica ya no existe acá).
    return Promise.all(
      posts.map(async (item) => {
        try {
          const views = await getFacebookPostViews(userId, connectedAccountId, item.externalId);
          return { ...item, metrics: { ...item.metrics, impressions: views ?? undefined } };
        } catch (err) {
          console.warn(`FB Composio: no se pudieron traer vistas de ${item.externalId}:`, err);
          return item;
        }
      })
    );
  },

  async fetchAudience(account: ProviderAccount): Promise<ProviderAudienceSnapshot> {
    const { userId, connectedAccountId } = requireComposio(account);
    const pageId = await resolvePageId(userId, connectedAccountId, account.externalId);
    const [page, daily] = await Promise.all([
      getFacebookPageProfile(userId, connectedAccountId, pageId),
      getFacebookPageInsights(userId, connectedAccountId, pageId, 1),
    ]);
    return {
      followers: (page.followersCount ?? page.fanCount) ?? undefined,
      // Sin reachToday/reach7d: Meta deprecó el reach a nivel de Página,
      // page_media_view (vistas) es lo más cercano que queda y SÍ es
      // aditivo entre días (es un conteo de eventos, no cuentas únicas)
      // — no necesita el truco de total_value, a diferencia del reach
      // de Instagram. El KPI de 7d se arma sumando 7 días de esto en
      // vez de pedir un total aparte (ver getKpiTrends).
      interactionsToday: daily.mediaViews ?? undefined,
    };
  },
};
