import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getDmThread } from "@/lib/dms/queries";
import { DmThreadView } from "./DmThreadView";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const thread = await getDmThread(supabase, conversationId);

  if (!thread) notFound();

  const networkLabel = thread.platform === "facebook" ? "Facebook Messenger" : "Instagram";

  return (
    <>
      <PageHeader
        title={thread.conversation.participant_name ?? "Usuario"}
        description={[networkLabel, thread.account_label, thread.brand?.name].filter(Boolean).join(" · ")}
        action={
          <Link href="/messages" className="text-xs font-medium text-accent hover:underline">
            ← Volver a la bandeja
          </Link>
        }
      />
      <DmThreadView thread={thread} />
    </>
  );
}
