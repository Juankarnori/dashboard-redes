import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";

const LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-600"
      )}
    >
      {LABELS[platform]}
    </span>
  );
}
