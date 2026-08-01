import Image from "next/image";
import Link from "next/link";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { ReplyForm } from "@/components/dashboard/ReplyForm";
import type { CommentInboxItem } from "@/lib/analytics/queries";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export function CommentInboxRow({ comment, onReplied }: { comment: CommentInboxItem; onReplied: () => void }) {
  return (
    <div className="flex gap-3 rounded-[--radius-card] border border-border bg-surface-1 p-4">
      <Link
        href={`/content/${comment.content.id}`}
        className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-[0.5rem] bg-surface-2 sm:block"
      >
        {comment.content.thumbnail_url ? (
          <Image
            src={comment.content.thumbnail_url}
            alt={comment.content.caption ?? "Contenido"}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[0.65rem] text-ink-400">Sin img</div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={comment.platform} />
          {comment.brand && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: comment.brand.color }} />
              {comment.brand.name}
            </span>
          )}
          <span className="text-xs text-ink-400">{comment.account_label}</span>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-900">{comment.author_name ?? "Usuario"}</span>
          {comment.commented_at && (
            <span className="tabular text-xs text-ink-400">{formatDate(comment.commented_at)}</span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-600">{comment.text}</p>

        <div className="mt-1 flex items-center gap-3">
          <Link
            href={`/content/${comment.content.id}`}
            className="text-xs font-medium text-accent hover:underline"
          >
            Ver post →
          </Link>
        </div>

        <ReplyForm commentId={comment.id} replied={comment.replied} onReplied={onReplied} />
      </div>
    </div>
  );
}
