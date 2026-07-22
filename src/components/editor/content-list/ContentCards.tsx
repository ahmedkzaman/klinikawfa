import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { formatDate, StatusBadge } from "@/components/editor/content-list/ContentTable";
import type { ContentListItem } from "@/features/website-cms/domain/content";
import { TrashActions } from "@/components/editor/content-list/TrashActions";

export function ContentCards({
  items,
  selected,
  editBaseHref,
  onToggle,
  onChanged,
}: {
  items: ContentListItem[];
  selected: ReadonlySet<string>;
  editBaseHref: string;
  onToggle: (id: string) => void;
  onChanged?: () => void;
}) {
  return (
    <ul className="space-y-3 md:hidden">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              aria-label={`Select ${item.title} on mobile`}
              checked={selected.has(item.id)}
              onChange={() => onToggle(item.id)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link aria-label={item.title} className="font-semibold text-slate-950" to={`${editBaseHref}/${item.id}`}>{`\u200B${item.title}`}</Link>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-1 break-all text-xs text-slate-500">/{item.slug}</p>
              {item.typeLabel && <p className="mt-1 text-xs font-medium text-slate-600">{`\u200B${item.typeLabel}`}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-slate-500">Author</dt><dd className="mt-1 text-slate-800">{item.authorName ?? "—"}</dd></div>
                <div><dt className="text-slate-500">Updated</dt><dd className="mt-1 text-slate-800">{formatDate(item.updatedAt)}</dd></div>
              </dl>
              <div className="mt-4">
                {item.status === "trash"
                  ? <TrashActions onChanged={onChanged} resourceId={item.id} resourceType={item.type} />
                  : <Button asChild size="sm" variant="outline"><Link to={`${editBaseHref}/${item.id}`}>Edit</Link></Button>}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
