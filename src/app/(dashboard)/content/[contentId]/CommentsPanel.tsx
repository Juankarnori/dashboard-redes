"use client";

import { ReplyForm } from "@/components/dashboard/ReplyForm";

interface CommentRow {
  id: string;
  parent_comment_id: string | null;
  author_name: string | null;
  text: string;
  like_count: number | null;
  commented_at: string | null;
  replied: boolean;
  is_business_reply: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export function CommentsPanel({ comments }: { comments: CommentRow[] }) {
  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = new Map<string, CommentRow[]>();
  for (const c of comments) {
    if (!c.parent_comment_id) continue;
    const bucket = repliesByParent.get(c.parent_comment_id) ?? [];
    bucket.push(c);
    repliesByParent.set(c.parent_comment_id, bucket);
  }

  if (topLevel.length === 0) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
        Sin comentarios todavía.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {topLevel.map((comment) => (
        <CommentThread key={comment.id} comment={comment} replies={repliesByParent.get(comment.id) ?? []} />
      ))}
    </div>
  );
}

function CommentThread({ comment, replies }: { comment: CommentRow; replies: CommentRow[] }) {
  return (
    <div className="rounded-[--radius-card] border border-border bg-surface-1 p-4">
      <CommentRowView comment={comment} />
      {replies.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-l-2 border-border pl-3">
          {replies.map((reply) => (
            <CommentRowView key={reply.id} comment={reply} />
          ))}
        </div>
      )}
      {!comment.is_business_reply && <ReplyForm commentId={comment.id} replied={comment.replied} />}
    </div>
  );
}

function CommentRowView({ comment }: { comment: CommentRow }) {
  return (
    <div className={comment.is_business_reply ? "rounded-[0.5rem] bg-accent-soft p-2" : ""}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink-900">
          {comment.is_business_reply ? "Tu respuesta" : (comment.author_name ?? "Usuario")}
        </span>
        {comment.commented_at && (
          <span className="tabular text-xs text-ink-400">{formatDate(comment.commented_at)}</span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-ink-600">{comment.text}</p>
    </div>
  );
}

