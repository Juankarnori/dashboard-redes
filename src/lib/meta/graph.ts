import { GRAPH_BASE } from "./oauth";
import type { MetaAvailablePage } from "@/types/db";

interface RawPage {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string };
}

interface RawPagesResponse {
  data: RawPage[];
  paging?: { next?: string };
}

interface RawIgAccount {
  id: string;
  username?: string;
  profile_picture_url?: string;
}

/**
 * Trae todas las Pages de Facebook que administra el usuario autenticado,
 * junto con su Instagram Business/Creator vinculado (si existe).
 * Recorre paginación por si el usuario administra muchas Pages.
 */
export async function fetchManagedPages(userAccessToken: string): Promise<MetaAvailablePage[]> {
  const pages: MetaAvailablePage[] = [];
  let url: string | undefined =
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account&limit=50&access_token=${encodeURIComponent(
      userAccessToken
    )}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meta /me/accounts falló: ${res.status} ${await res.text()}`);
    }
    const json: RawPagesResponse = await res.json();

    for (const page of json.data) {
      const entry: MetaAvailablePage = {
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        profile_picture_url: page.picture?.data?.url,
      };

      if (page.instagram_business_account?.id) {
        const ig = await fetchInstagramAccount(
          page.instagram_business_account.id,
          page.access_token
        );
        entry.instagram_business_account_id = ig.id;
        entry.instagram_username = ig.username;
        entry.profile_picture_url = entry.profile_picture_url ?? ig.profile_picture_url;
      }

      pages.push(entry);
    }

    url = json.paging?.next;
  }

  return pages;
}

async function fetchInstagramAccount(
  igAccountId: string,
  pageAccessToken: string
): Promise<RawIgAccount> {
  const url = `${GRAPH_BASE}/${igAccountId}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(
    pageAccessToken
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Meta IG business account falló: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
