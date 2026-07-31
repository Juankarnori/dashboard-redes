import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SelectPagesForm } from "@/components/dashboard/SelectPagesForm";
import type { MetaAvailablePage } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function SelectPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session: sessionId } = await searchParams;
  if (!sessionId) redirect("/settings/accounts");

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("oauth_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || new Date(session.expires_at) < new Date()) {
    redirect("/settings/accounts?meta_error=sesion_expirada");
  }

  const pages = session!.available_pages as MetaAvailablePage[];

  return (
    <>
      <PageHeader
        title="Elige qué conectar"
        description="Estas son las Pages de Facebook que administras en Meta. Elige cuáles pertenecen a este negocio."
      />
      <div className="px-4 py-6 sm:px-8">
        {pages.length === 0 ? (
          <p className="text-sm text-ink-600">
            No encontramos ninguna Page administrada por tu usuario de Meta.
          </p>
        ) : (
          <SelectPagesForm sessionId={session!.id} pages={pages} />
        )}
      </div>
    </>
  );
}
