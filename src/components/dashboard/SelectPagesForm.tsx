"use client";

import { useActionState } from "react";
import { connectSelectedPages, type ConnectPagesState } from "@/app/(dashboard)/settings/accounts/select/actions";
import { Button } from "@/components/ui/Button";

interface PageOption {
  page_name: string;
  instagram_username?: string;
  instagram_business_account_id?: string;
}

const initialState: ConnectPagesState = {};

export function SelectPagesForm({
  sessionId,
  pages,
}: {
  sessionId: string;
  pages: PageOption[];
}) {
  const [state, formAction, isPending] = useActionState(connectSelectedPages, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="session_id" value={sessionId} />

      <div className="flex flex-col gap-2">
        {pages.map((page, index) => (
          <label
            key={index}
            className="flex cursor-pointer items-center gap-3 rounded-[--radius-card] border border-border bg-surface-1 px-4 py-3 hover:bg-surface-2"
          >
            <input
              type="checkbox"
              name="page_index"
              value={index}
              defaultChecked
              className="h-4 w-4 accent-[--color-accent]"
            />
            <div>
              <p className="text-sm font-medium text-ink-900">{page.page_name}</p>
              <p className="text-xs text-ink-400">
                Facebook Page
                {page.instagram_username ? ` · Instagram @${page.instagram_username}` : ""}
              </p>
            </div>
          </label>
        ))}
      </div>

      {state.error && (
        <p className="rounded-[0.5rem] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Conectando…" : "Conectar seleccionadas"}
      </Button>
    </form>
  );
}
