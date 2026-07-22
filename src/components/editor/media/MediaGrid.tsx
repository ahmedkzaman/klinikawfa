import { Link } from "react-router-dom";

import type { WebsiteMedia } from "@/features/website-cms/media/api";

export function MediaGrid({ items, onSelect }: { items: WebsiteMedia[]; onSelect?: (media: WebsiteMedia) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((media) => {
    const content = <><div className="aspect-square overflow-hidden rounded-t-xl bg-slate-100">{media.mimeType.startsWith("image/") ? <img alt={media.altMs || media.storagePath} className="h-full w-full object-cover" loading="lazy" src={media.publicUrl} /> : <video aria-label={media.altMs || media.storagePath} className="h-full w-full object-cover" muted preload="metadata" src={media.publicUrl} />}</div><div className="p-3"><p className="truncate text-sm font-semibold text-slate-900">{media.altMs || media.storagePath.split("/").pop()}</p><p className="mt-1 text-xs text-slate-500">{media.referenceCount} reference{media.referenceCount === 1 ? "" : "s"}</p></div></>;
    return onSelect ? <button className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm hover:border-blue-400" key={media.id} onClick={() => onSelect(media)} type="button">{content}</button> : <Link className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm hover:border-blue-400" key={media.id} to={`/editor/media/${media.id}`}>{content}</Link>;
  })}</div>;
}
