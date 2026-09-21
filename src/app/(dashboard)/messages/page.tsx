import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { getDmInbox } from "@/lib/dms/queries";
import { DmInbox } from "./DmInbox";
import { DmTikTokNotice } from "./DmTikTokNotice";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function MessagesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string }>;
}) {
  const { brand, platform } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");

  const items = await getDmInbox(supabase, {
    brandId: brand,
    platform: platform as Platform | undefined,
  });

  return (
    <>
      <PageHeader
        title="Mensajes"
        description="Mensajes directos de Facebook Messenger e Instagram, en un solo lugar."
      />
      <FilterBar brands={brands ?? []} />

      {platform === "tiktok" && <DmTikTokNotice />}

      <div className="px-4 py-6 sm:px-8">
        <DmInbox items={items} nowIso={new Date().toISOString()} />
      </div>
    </>
  );
}
