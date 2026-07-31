"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MetaAvailablePage } from "@/types/db";

export interface ConnectPagesState {
  error?: string;
}

export async function connectSelectedPages(
  _prevState: ConnectPagesState,
  formData: FormData
): Promise<ConnectPagesState> {
  const sessionId = String(formData.get("session_id") ?? "");
  const selectedIndexes = formData
    .getAll("page_index")
    .map((v) => Number(v))
    .filter((n) => !Number.isNaN(n));

  if (!sessionId || selectedIndexes.length === 0) {
    return { error: "Selecciona al menos una Page para conectar." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("oauth_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return { error: "La sesión de conexión expiró. Intenta de nuevo desde Cuentas." };
  }
  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("oauth_sessions").delete().eq("id", session.id);
    return { error: "La sesión de conexión expiró. Intenta de nuevo desde Cuentas." };
  }

  const pages = session.available_pages as MetaAvailablePage[];
  const toConnect = selectedIndexes.map((i) => pages[i]).filter(Boolean);

  for (const page of toConnect) {
    const { data: fbAccount, error: fbError } = await supabase
      .from("accounts")
      .upsert(
        {
          brand_id: session.brand_id,
          platform: "facebook",
          role: "page",
          external_id: page.page_id,
          display_name: page.page_name,
          profile_image_url: page.profile_picture_url ?? null,
          access_token: page.page_access_token, // ya cifrado
          status: "active",
        },
        { onConflict: "platform,external_id" }
      )
      .select("id")
      .single();

    if (fbError || !fbAccount) {
      return { error: `No se pudo conectar la Page "${page.page_name}": ${fbError?.message}` };
    }

    if (page.instagram_business_account_id) {
      await supabase.from("accounts").upsert(
        {
          brand_id: session.brand_id,
          platform: "instagram",
          role: "business",
          external_id: page.instagram_business_account_id,
          username: page.instagram_username ?? null,
          display_name: page.instagram_username ?? page.page_name,
          profile_image_url: page.profile_picture_url ?? null,
          access_token: page.page_access_token, // misma Page token, cifrada
          parent_account_id: fbAccount.id,
          status: "active",
        },
        { onConflict: "platform,external_id" }
      );
    }
  }

  await supabase.from("oauth_sessions").delete().eq("id", session.id);
  redirect("/settings/accounts");
}
