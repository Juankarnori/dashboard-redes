import { cn } from "@/lib/utils";
import type { ContentType } from "@/types/db";

const LABELS: Record<ContentType, string> = {
  post: "Post",
  reel: "Reel",
  story: "Historia",
  carousel: "Carrusel",
  video: "Video",
};

// Las historias son las únicas que expiran — se marcan con el color "live".
const STORY_STYLE = "border-live/30 bg-live-soft text-live";
const DEFAULT_STYLE = "border-border bg-surface-0 text-ink-600";

export function ContentTypeBadge({ type }: { type: ContentType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        type === "story" ? STORY_STYLE : DEFAULT_STYLE
      )}
    >
      {LABELS[type]}
    </span>
  );
}
