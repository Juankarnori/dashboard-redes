"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createBrand(_prevState: { error?: string }, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle un nombre al negocio." };

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (á → a) tras NFD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("brands")
    .insert({ owner_id: user!.id, name, slug: slug || crypto.randomUUID().slice(0, 8) });

  if (error) {
    return { error: error.message.includes("duplicate") ? "Ya tienes un negocio con ese nombre." : error.message };
  }

  revalidatePath("/settings/accounts");
  return {};
}
