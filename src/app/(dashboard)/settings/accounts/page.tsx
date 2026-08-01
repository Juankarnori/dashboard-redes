import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { NewBrandForm } from "@/components/dashboard/NewBrandForm";
import { AccountsBoard } from "./AccountsBoard";
import type { Database } from "@/types/db";

export const dynamic = "force-dynamic";

type BrandWithAccounts = Database["public"]["Tables"]["brands"]["Row"] & {
  accounts: Database["public"]["Tables"]["accounts"]["Row"][];
};

export default async function AccountsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta_error?: string; tiktok_error?: string }>;
}) {
  const { meta_error, tiktok_error } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("*, accounts(*)")
    .order("created_at", { ascending: true });

  const list = (brands ?? []) as BrandWithAccounts[];

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Un negocio agrupa sus cuentas de Instagram y Facebook conectadas."
        action={<NewBrandForm />}
      />

      <div className="flex flex-col gap-4 px-4 py-6 sm:px-8">
        {meta_error && (
          <div className="rounded-[--radius-card] bg-negative-soft px-4 py-3 text-sm text-negative">
            No se pudo conectar con Meta ({meta_error}). Intenta de nuevo.
          </div>
        )}
        {tiktok_error && (
          <div className="rounded-[--radius-card] bg-negative-soft px-4 py-3 text-sm text-negative">
            No se pudo conectar con TikTok ({tiktok_error}). Intenta de nuevo.
          </div>
        )}

        <AccountsBoard brands={list} />
      </div>
    </>
  );
}
