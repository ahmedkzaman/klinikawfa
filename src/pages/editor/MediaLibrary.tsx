import { Grid3X3, List, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { MediaGrid } from "@/components/editor/media/MediaGrid";
import { MediaList } from "@/components/editor/media/MediaList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listMedia, uploadAndCreateMedia, type WebsiteMedia } from "@/features/website-cms/media/api";
import { MediaDetail } from "@/pages/editor/MediaDetail";

export function MediaLibrary() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<WebsiteMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [status, setStatus] = useState<"active" | "trash">("active");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listMedia({ search, status, limit: 100 }).then((result) => setItems(result.items)).catch(() => setError("Media Library could not be loaded.")).finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, status]);

  return <section className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-950">Media Library</h1><p className="mt-1 text-sm text-slate-600">Reusable public website images and videos. Never upload patient or private material.</p></div><div><input accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" id="media-library-upload" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAndCreateMedia(file, "gallery").then((media) => setItems((current) => [media, ...current])).catch(() => setError("Upload failed. No library record was created.")); }} /><Button onClick={() => document.getElementById("media-library-upload")?.click()} type="button"><Upload className="h-4 w-4" />Upload media</Button></div></header><div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"><div className="flex gap-1"><Button onClick={() => setStatus("active")} size="sm" variant={status === "active" ? "default" : "ghost"}>Library</Button><Button onClick={() => setStatus("trash")} size="sm" variant={status === "trash" ? "default" : "ghost"}>Trash</Button></div><Input aria-label="Search media" className="sm:max-w-md" onChange={(event) => setSearch(event.target.value)} placeholder="Search media" role="searchbox" value={search} /><div className="ml-auto flex gap-1"><Button aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} size="icon" type="button" variant="ghost"><Grid3X3 /></Button><Button aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} size="icon" type="button" variant="ghost"><List /></Button></div></div>{error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</p>}{loading ? <p className="p-8 text-center text-sm text-slate-500" role="status">Loading media</p> : items.length ? view === "grid" ? <MediaGrid items={items} /> : <MediaList items={items} /> : <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No media found.</p>}</section>;
}

export const MediaWorkspace = MediaDetail;
