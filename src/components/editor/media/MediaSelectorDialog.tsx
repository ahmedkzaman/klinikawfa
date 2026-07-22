import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MediaGrid } from "./MediaGrid";
import type { WebsiteMedia } from "@/features/website-cms/media/api";
import type { WebsiteMediaFolder } from "@/features/website-cms/media/validation";

export function MediaSelectorDialog({ folder, label = "Choose media", onSelect }: { folder: WebsiteMediaFolder; label?: string; onSelect(media: WebsiteMedia): void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WebsiteMedia[]>([]);
  useEffect(() => { if (open) void import("@/features/website-cms/media/api").then(({ listMedia }) => listMedia({ status: "active" })).then((result) => setItems(result.items)); }, [open]);
  return <><Button onClick={() => setOpen(true)} type="button" variant="outline">{label}</Button>{open && <div aria-label="Choose website media" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog"><div className="max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Media Library</h2><Button onClick={() => setOpen(false)} variant="ghost">Close</Button></div><label className="mb-5 inline-flex cursor-pointer rounded-md border px-4 py-2 text-sm font-medium">Upload new<input accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void import("@/features/website-cms/media/api").then(({ uploadAndCreateMedia }) => uploadAndCreateMedia(file, folder)).then((media) => { setItems((current) => [media, ...current]); onSelect(media); setOpen(false); }); }} /></label><MediaGrid items={items} onSelect={(media) => { onSelect(media); setOpen(false); }} /></div></div>}</>;
}
