import { Loader2, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { listServiceResources, type ServiceResourceSummary } from "@/features/website-cms/api/resources";
import { CANONICAL_SERVICE_SEO_TARGETS } from "@/features/website-cms/service-seo/domain";
import { resolveCanonicalServiceSlug } from "@/lib/serviceSlugMap";

export function ServicesEditorList() {
  const [items, setItems] = useState<ServiceResourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void listServiceResources()
      .then((rows) => { if (active) setItems(rows); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const contentByPath = useMemo(() => new Map(items.map((item) => [
    `/services/${resolveCanonicalServiceSlug(item.slug)}/`,
    item,
  ])), [items]);
  const canonicalContentIds = useMemo(() => new Set(
    CANONICAL_SERVICE_SEO_TARGETS
      .map((target) => contentByPath.get(target.path)?.id)
      .filter((id): id is string => Boolean(id)),
  ), [contentByPath]);
  const landingPages = useMemo(
    () => items.filter((item) => !canonicalContentIds.has(item.id)),
    [canonicalContentIds, items],
  );

  return (
    <section className="space-y-6" aria-labelledby="services-editor-title">
      <header>
        <p className="text-sm font-medium text-blue-700">Public content</p>
        <h1 className="mt-1 text-2xl font-semibold" id="services-editor-title">Services</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Manage content for every service landing page and bilingual search and social metadata for canonical service pages. Category aliases continue to inherit their canonical page.</p>
      </header>
      {loading && <p className="flex items-center gap-2 rounded-xl border bg-white p-5 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading services</p>}
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">Content links could not be loaded. SEO editing remains available.</p>}
      {!loading && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {CANONICAL_SERVICE_SEO_TARGETS.map((target) => {
            const content = contentByPath.get(target.path);
            return (
              <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={target.id}>
                <div>
                  <h2 className="font-semibold text-slate-900">{target.labelMs}</h2>
                  <p className="mt-1 text-sm text-slate-600">{target.labelEn}</p>
                  <p className="mt-1 text-xs text-slate-500">{target.path}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {content && <Button asChild size="sm" variant="outline"><Link to={`/editor/services/${content.id}`}><Pencil className="mr-2 h-4 w-4" />Edit content</Link></Button>}
                  <Button asChild size="sm"><Link to={`/editor/services/seo/${target.id}`}><Search className="mr-2 h-4 w-4" />Edit SEO</Link></Button>
                </div>
              </li>
            );
          })}
          {landingPages.map((item) => {
            const path = `/services/${resolveCanonicalServiceSlug(item.slug)}/`;
            return (
              <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
                <div>
                  <h2 className="font-semibold text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">Landing page</p>
                  <p className="mt-1 text-xs text-slate-500">{path}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link aria-label={`Edit content: ${item.title}`} to={`/editor/services/${item.id}`}>
                    <Pencil className="mr-2 h-4 w-4" />Edit content
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
