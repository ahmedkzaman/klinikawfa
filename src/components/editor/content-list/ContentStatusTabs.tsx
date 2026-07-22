import type { ContentStatus } from "@/features/website-cms/domain/content";
import { cn } from "@/lib/utils";

const statuses: readonly (ContentStatus | "all")[] = [
  "all",
  "published",
  "draft",
  "scheduled",
  "trash",
];

export function ContentStatusTabs({
  active,
  total,
  totals,
  onChange,
}: {
  active: ContentStatus | "all";
  total: number;
  totals: Record<ContentStatus, number>;
  onChange: (status: ContentStatus | "all") => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter by publication status"
      className="flex gap-1 overflow-x-auto border-b border-slate-200"
    >
      {statuses.map((status) => {
        const count = status === "all" ? total : totals[status];
        const label = `${labelFor(status)} ${count}`;
        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={active === status}
            aria-label={label}
            onClick={() => onChange(status)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              active === status
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-600 hover:text-slate-950",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function labelFor(status: ContentStatus | "all") {
  return status === "all"
    ? "All"
    : status.charAt(0).toUpperCase() + status.slice(1);
}
