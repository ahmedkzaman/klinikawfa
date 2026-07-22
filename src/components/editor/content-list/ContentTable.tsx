import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ContentListItem } from "@/features/website-cms/domain/content";
import { TrashActions } from "@/components/editor/content-list/TrashActions";

export function ContentTable({
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
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Author</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Updated</th>
            <th className="px-4 py-3">Scheduled</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <tr key={item.id} className="align-top hover:bg-slate-50/70">
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                />
              </td>
              <td className="px-4 py-4">
                <Link className="font-semibold text-slate-950 hover:text-blue-700" to={`${editBaseHref}/${item.id}`}>
                  {item.title}
                </Link>
                <p className="mt-1 text-xs text-slate-500">/{item.slug}</p>
                {item.typeLabel && <Badge className="mt-2" variant="secondary">{item.typeLabel}</Badge>}
              </td>
              <td className="px-4 py-4 text-slate-600">{item.authorName ?? "—"}</td>
              <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
              <td className="px-4 py-4 text-slate-600">{formatDate(item.updatedAt)}</td>
              <td className="px-4 py-4 text-slate-600">{item.scheduledAt ? formatDate(item.scheduledAt) : "—"}</td>
              <td className="px-4 py-4 text-right">
                {item.status === "trash"
                  ? <TrashActions onChanged={onChanged} resourceId={item.id} resourceType={item.type} />
                  : <Button asChild size="sm" variant="outline"><Link to={`${editBaseHref}/${item.id}`}>Edit</Link></Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: ContentListItem["status"] }) {
  return <Badge variant={status === "published" ? "default" : "outline"}>{status}</Badge>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(value));
}
