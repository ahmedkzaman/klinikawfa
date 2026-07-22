import { FilePlus2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ContentBulkActions } from "@/components/editor/content-list/ContentBulkActions";
import { ContentCards } from "@/components/editor/content-list/ContentCards";
import { ContentStatusTabs } from "@/components/editor/content-list/ContentStatusTabs";
import { ContentTable } from "@/components/editor/content-list/ContentTable";
import { useContentListState } from "@/components/editor/content-list/useContentListState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContentListResult } from "@/features/website-cms/domain/content";
import type { WebsiteResourceAdapter } from "@/features/website-cms/resources/adapters";

const emptyResult: ContentListResult = {
  items: [],
  total: 0,
  totalsByStatus: { draft: 0, scheduled: 0, published: 0, trash: 0 },
};

export function ContentListPage<TDraft>({
  adapter,
  resourceLabel,
  createHref,
}: {
  adapter: WebsiteResourceAdapter<TDraft>;
  resourceLabel: string;
  createHref: string;
}) {
  const state = useContentListState();
  const [result, setResult] = useState<ContentListResult>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const editBaseHref = useMemo(() => createHref.replace(/\/new$/, ""), [createHref]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await adapter.list(state.query));
    } catch {
      setError(`${resourceLabel} could not be loaded.`);
    } finally {
      setLoading(false);
    }
  }, [adapter, resourceLabel, state.query]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyBulkTrash = async () => {
    setBulkBusy(true);
    setError(null);
    try {
      const selectedItems = result.items.filter((item) => selected.has(item.id));
      await Promise.all(
        selectedItems.map((item) => adapter.trash(item.id, item.revision)),
      );
      setSelected(new Set());
      await load();
    } catch {
      setError("The selected content could not be moved to Trash.");
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{resourceLabel}</h1>
          <p className="mt-1 text-sm text-slate-600">Manage drafts, publishing, schedules, and Trash.</p>
        </div>
        <Button asChild><Link to={createHref}><FilePlus2 className="mr-2 h-4 w-4" aria-hidden="true" />Add {singular(resourceLabel)}</Link></Button>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-sm">
        <ContentStatusTabs active={state.query.status} total={result.total} totals={result.totalsByStatus} onChange={state.setStatus} />
        <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <Input type="search" role="searchbox" aria-label={`Search ${resourceLabel}`} placeholder={`Search ${resourceLabel.toLowerCase()}`} value={state.searchInput} onChange={(event) => state.setSearchInput(event.target.value)} />
          <select aria-label={`Sort ${resourceLabel}`} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={state.query.sort} onChange={(event) => state.setSort(event.target.value as typeof state.query.sort)}>
            <option value="updated_desc">Recently updated</option><option value="updated_asc">Oldest updated</option><option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
          </select>
        </div>
      </div>

      <ContentBulkActions selectedCount={selected.size} busy={bulkBusy} onApply={applyBulkTrash} />
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {loading && <p role="status" className="rounded-xl border bg-white p-5 text-sm text-slate-600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading {resourceLabel.toLowerCase()}</p>}
      {!loading && !error && result.items.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">No {resourceLabel.toLowerCase()} match this view.</div>}
      {!loading && result.items.length > 0 && <><ContentTable items={result.items} selected={selected} editBaseHref={editBaseHref} onChanged={() => void load()} onToggle={toggle} /><ContentCards items={result.items} selected={selected} editBaseHref={editBaseHref} onChanged={() => void load()} onToggle={toggle} /></>}
    </section>
  );
}

function singular(label: string) {
  return label.endsWith("s") ? label.slice(0, -1).toLowerCase() : label.toLowerCase();
}
