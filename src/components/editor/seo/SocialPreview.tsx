export function SocialPreview({ title, description }: { title: string; description: string }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50" aria-label="Social sharing preview"><div className="aspect-[1.91/1] bg-gradient-to-br from-blue-100 to-emerald-100" /><div className="p-4"><p className="text-xs uppercase text-slate-500">klinikawfa.com</p><p className="mt-1 font-semibold text-slate-900">{title || "Page title"}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600">{description}</p></div></div>;
}
