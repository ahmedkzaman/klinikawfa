import { ExternalLink, FilePlus2, Loader2, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listWebsiteDestinations } from "@/features/website-cms/catalogue/api";
import type { WebsiteDestination, WebsiteDestinationType } from "@/features/website-cms/catalogue/domain";
import type { ContentStatus } from "@/features/website-cms/domain/content";

type TypeFilter = "all" | WebsiteDestinationType;
type StatusFilter = "all" | ContentStatus;

const typeLabels: Record<WebsiteDestinationType, string> = {
  fixed: "Fixed page", page: "Page", service: "Service", post: "Post",
};
const errorLabels: Record<WebsiteDestinationType, string> = {
  fixed: "Fixed pages", page: "Pages", service: "Services", post: "Posts",
};

export function WebsitePagesCatalogue() {
  const [items, setItems] = useState<WebsiteDestination[]>([]);
  const [errors, setErrors] = useState<WebsiteDestinationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    let active = true;
    void listWebsiteDestinations()
      .then((result) => { if (active) { setItems(result.items); setErrors(result.errors); } })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return items.filter((item) =>
      (type === "all" || item.type === type) &&
      (status === "all" || item.status === status) &&
      (!needle || `${item.titleMs} ${item.titleEn} ${item.href}`.toLocaleLowerCase().includes(needle)),
    ).sort((a, b) => a.titleMs.localeCompare(b.titleMs));
  }, [items, search, status, type]);

  return (
    <section className="space-y-6" data-testid="pages-catalogue">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight text-slate-950">Pages</h1><p className="mt-1 text-sm text-slate-600">Browse every public destination and open its correct editor.</p></div>
        <Button asChild><Link to="/editor/pages/new"><FilePlus2 className="mr-2 h-4 w-4" />Add page</Link></Button>
      </header>

      {errors.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">{errors.map((item) => errorLabels[item]).join(", ")} could not be loaded. Other destinations remain available.</p>}
      {failed && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Website destinations could not be loaded.</p>}

      <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <Input aria-label="Search pages" onChange={(event) => setSearch(event.target.value)} placeholder="Search by title or URL" role="searchbox" type="search" value={search} />
        <select aria-label="Page type" className="h-10 rounded-md border bg-background px-3 text-sm" onChange={(event) => setType(event.target.value as TypeFilter)} value={type}>
          <option value="all">All types</option><option value="fixed">Fixed pages</option><option value="page">Pages</option><option value="service">Services</option><option value="post">Posts</option>
        </select>
        <select aria-label="Page status" className="h-10 rounded-md border bg-background px-3 text-sm" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
          <option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="trash">Trash</option>
        </select>
      </div>

      {loading && <p className="rounded-xl border bg-white p-5 text-sm text-slate-600" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading pages</p>}
      {!loading && !failed && filtered.length === 0 && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">No pages match these filters.</p>}
      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(15rem,1fr)_9rem_9rem_minmax(12rem,1fr)_auto] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Page</span><span>Type</span><span>Status</span><span>URL</span><span>Actions</span>
          </div>
          <ul className="divide-y">
            {filtered.map((item) => <CatalogueRow item={item} key={item.id} />)}
          </ul>
        </div>
      )}
    </section>
  );
}

function CatalogueRow({ item }: { item: WebsiteDestination }) {
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(15rem,1fr)_9rem_9rem_minmax(12rem,1fr)_auto] md:items-center">
      <div><p className="font-semibold text-slate-900">{item.titleMs}</p>{item.titleEn !== item.titleMs && <p className="mt-1 text-sm text-slate-600">{item.titleEn}</p>}</div>
      <span className="text-sm text-slate-700">{item.typeLabel ?? typeLabels[item.type]}</span>
      <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">{item.status}</span>
      <code className="break-all text-xs text-slate-600">{item.href}</code>
      <div className="flex flex-wrap gap-2">
        {item.editHref && <Button asChild size="sm" variant="outline"><Link aria-label={`Edit ${item.titleMs}`} to={item.editHref}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>}
        <Button asChild size="sm" variant="ghost"><a aria-label={`View ${item.titleMs}`} href={item.href} rel="noreferrer" target="_blank"><ExternalLink className="mr-1 h-4 w-4" />View</a></Button>
      </div>
    </li>
  );
}
