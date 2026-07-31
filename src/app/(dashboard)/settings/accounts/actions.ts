"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface MoveAccountResult {
  error?: string;
  movedAccountIds?: string[];
}

/**
 * Mueve una cuenta ya conectada a otro negocio (solo actualiza
 * accounts.brand_id — no toca el token ni requiere reconectar OAuth).
 *
 * Si la cuenta es una Page de Facebook con un Instagram vinculado
 * (accounts.parent_account_id -> esta Page), el Instagram se mueve junto
 * con ella: son la misma cuenta de negocio real y separarlas dejaría el
 * contenido de Instagram apareciendo bajo el negocio equivocado. Mover
 * un Instagram vinculado no arrastra a su Page — es la unidad más chica
 * y puede reasignarse sola.
 *
 * RLS ("owner writes own accounts") ya exige que tanto la cuenta como el
 * negocio destino pertenezcan al usuario logueado, así que no hace falta
 * repetir esa validación acá.
 */
export async function moveAccountToBrand(
  accountId: string,
  targetBrandId: string
): Promise<MoveAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, brand_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { error: "Cuenta no encontrada" };
  if (account.brand_id === targetBrandId) return { movedAccountIds: [accountId] };

  const { data: linked } = await supabase
    .from("accounts")
    .select("id")
    .eq("parent_account_id", accountId);

  const idsToMove = [accountId, ...(linked ?? []).map((a) => a.id)];

  const { error } = await supabase.from("accounts").update({ brand_id: targetBrandId }).in("id", idsToMove);

  if (error) return { error: error.message };

  revalidatePath("/settings/accounts");
  return { movedAccountIds: idsToMove };
}
