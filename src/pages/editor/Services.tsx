import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { listServiceResources, type ServiceResourceSummary } from "@/features/website-cms/api/resources";

export function ServicesEditorList() {
  const [items, setItems] = useState<ServiceResourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void listServiceResources().then((rows) => { if (active) setItems(rows); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="space-y-6" aria-labelledby="services-editor-title">
    <header><p className="text-sm font-medium text-blue-700">Public content</p><h1 className="mt-1 text-2xl font-semibold" id="services-editor-title">Services</h1><p className="mt-2 text-sm leading-6 text-slate-600">Edit the three approved service categories. Public aliases continue to resolve to these pages.</p></header>
    {loading && <p className="flex items-center gap-2 rounded-xl border bg-white p-5 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading services</p>}
    {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Services could not be loaded. Refresh and try again.</p>}
    {!loading && !error && <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{items.map((item) => <li className="flex items-center justify-between gap-4 p-5" key={item.id}><div><h2 className="font-semibold text-slate-900">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{item.slug}</p></div><Button asChild size="sm" variant="outline"><Link to={`/editor/services/${item.id}`}><Pencil className="mr-2 h-4 w-4" />Edit</Link></Button></li>)}</ul>}
  </section>;
}
