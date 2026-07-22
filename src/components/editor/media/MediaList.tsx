import type { WebsiteMedia } from "@/features/website-cms/media/api";

export function MediaList({ items }: { items: WebsiteMedia[] }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">References</th></tr></thead><tbody>{items.map((media) => <tr className="border-t border-slate-100" key={media.id}><td className="px-4 py-3 font-medium">{media.altMs || media.storagePath}</td><td className="px-4 py-3">{media.mimeType}</td><td className="px-4 py-3">{Math.ceil(media.byteSize / 1024)} KB</td><td className="px-4 py-3">{media.referenceCount}</td></tr>)}</tbody></table></div>;
}
