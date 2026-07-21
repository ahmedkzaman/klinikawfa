import { FilePlus2, Loader2, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listEditorPages,
  type EditorWebsitePageSummary,
} from "@/features/website-cms/api/pages";

export function Pages() {
  const [pages, setPages] = useState<EditorWebsitePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPages(await listEditorPages());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void listEditorPages()
      .then((nextPages) => {
        if (mounted) setPages(nextPages);
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pages</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Create general content pages and edit the pre-seeded system pages.
          </p>
        </div>
        <Button asChild>
          <Link to="/editor/pages/new">
            <FilePlus2 aria-hidden="true" className="mr-2 h-4 w-4" />
            Create page
          </Link>
        </Button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <p>Pages could not be loaded. Check your connection and try again.</p>
          <Button className="mt-3" onClick={() => void loadPages()} size="sm" type="button" variant="outline">
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Loading pages
        </div>
      ) : pages.length === 0 ? (
        !error && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-medium text-slate-900">No content pages yet</p>
            <p className="mt-1 text-sm text-slate-600">Create a private draft to get started.</p>
          </div>
        )
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {pages.map((page) => (
            <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={page.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-all font-semibold text-slate-900">{page.slug}</p>
                  <Badge variant="secondary">
                    {page.kind === "system_content" ? "System content" : "Content"}
                  </Badge>
                  <Badge variant={page.status === "published" ? "default" : "outline"}>
                    {page.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">Revision {page.revision}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link aria-label={`Edit ${page.slug}`} to={`/editor/pages/${page.id}`}>
                  <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
