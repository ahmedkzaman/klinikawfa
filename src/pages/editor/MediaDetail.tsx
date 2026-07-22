import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteMediaPermanently, getMedia, restoreMedia, trashMedia, updateMediaMetadata, type WebsiteMedia } from "@/features/website-cms/media/api";

export function MediaDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [media, setMedia] = useState<WebsiteMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void getMedia(id).then(setMedia).catch(() => setError("Media item could not be loaded.")); }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!media) return <p role="status">Loading media details</p>;
  const update = (key: keyof WebsiteMedia, value: string) => setMedia((current) => current ? { ...current, [key]: value } : current);

  return (
    <section className="space-y-6">
      <header><h1 className="text-2xl font-bold">Media details</h1><p className="mt-1 text-sm text-slate-600">{media.storagePath} · {Math.ceil(media.byteSize / 1024)} KB · {media.width ?? "?"} × {media.height ?? "?"}</p></header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-100 p-4">{media.mimeType.startsWith("image/") ? <img alt={media.altMs} className="w-full rounded-lg" src={media.publicUrl} /> : <video className="w-full rounded-lg" controls src={media.publicUrl} />}</div>
        <div className="space-y-4 rounded-xl border bg-white p-5">
          {(["altMs", "altEn", "captionMs", "captionEn"] as const).map((key) => <div key={key}><Label htmlFor={key}>{key.replace(/([A-Z])/g, " $1")}</Label><Input className="mt-2" id={key} onChange={(event) => update(key, event.target.value)} value={media[key]} /></div>)}
          {(["descriptionMs", "descriptionEn"] as const).map((key) => <div key={key}><Label htmlFor={key}>{key.replace(/([A-Z])/g, " $1")}</Label><Textarea className="mt-2" id={key} onChange={(event) => update(key, event.target.value)} value={media[key]} /></div>)}
          <Button onClick={() => void updateMediaMetadata(media.id, media)}>Save details</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-5">
        {media.trashedAt ? (
          <>
            <Button onClick={() => void restoreMedia(media.id).then(() => navigate("/editor/media"))} variant="outline">Restore</Button>
            <Button disabled={media.referenceCount > 0} onClick={() => { if (window.confirm("Permanently delete this unreferenced media file?")) void deleteMediaPermanently(media.id).then(() => navigate("/editor/media")); }} variant="destructive">Delete permanently</Button>
          </>
        ) : <Button onClick={() => void trashMedia(media.id).then(() => navigate("/editor/media"))} variant="outline">Move to Trash</Button>}
        {media.referenceCount > 0 && <p className="w-full text-sm text-amber-800">Used by {media.referenceCount} website location(s). Remove those references first.</p>}
      </div>
    </section>
  );
}
