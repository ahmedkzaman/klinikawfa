export function GoogleSearchPreview({ title, description, url }: { title: string; description: string; url: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Google search preview"><p className="truncate text-sm text-emerald-800">{url}</p><p className="mt-1 text-xl text-blue-800">{title || "Page title"}</p><p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{description || "Add a helpful description for people searching for this page."}</p></div>;
}
