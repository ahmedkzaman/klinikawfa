import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";

import { GeneralPageRenderer } from "@/components/website/GeneralPageRenderer";
import { loadDraftPreview } from "@/features/website-cms/api/preview";
import type { GeneralPageContent } from "@/features/website-cms/schemas/page";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

type PreviewResult = Awaited<ReturnType<typeof loadDraftPreview>>;

export function DraftPreview() {
  const { resourceType = "", id = "" } = useParams();
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    void loadDraftPreview(resourceType, id).then((next) => {
      if (active) setResult(next);
    }).catch(() => {
      if (active) setError("This private draft preview is unavailable.");
    });
    return () => { active = false; };
  }, [id, resourceType]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">{error}</div>;
  if (!result) return <div className="flex items-center gap-2 p-6" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading private preview</div>;

  return (
    <div className="min-h-screen bg-white">
      <Helmet><meta content="noindex,nofollow" name="robots" /><title>Private draft preview | Klinik Awfa</title></Helmet>
      <div className="sticky top-0 z-20 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-950">Private draft preview — not published</div>
      {result.resourceType === "page" ? (
        <GeneralPageRenderer content={result.payload as GeneralPageContent} preview />
      ) : (
        <ResourceDraftPreview payload={result.payload as Record<string, unknown>} type={result.resourceType} />
      )}
    </div>
  );
}

function ResourceDraftPreview({ payload, type }: { payload: Record<string, unknown>; type: string }) {
  if (type === "gallery_image") return <figure className="mx-auto max-w-5xl p-8"><img alt={String(payload.altMs ?? "")} className="w-full rounded-2xl object-cover" src={String(payload.url ?? "")} /></figure>;
  if (type === "team_member") return <article className="mx-auto max-w-3xl p-8 text-center"><h1 className="text-4xl font-bold">{String(payload.nameMs ?? "")}</h1><p className="mt-3 text-blue-700">{String(payload.titleMs ?? "")}</p><p className="mt-6">{String(payload.bioMs ?? "")}</p></article>;
  if (type === "review") return <figure className="mx-auto max-w-2xl p-8 text-center"><blockquote className="text-2xl">“{String(payload.reviewTextMs ?? "")}”</blockquote><figcaption className="mt-4 font-semibold">{String(payload.nameMs ?? "")}</figcaption></figure>;
  return <article className="mx-auto max-w-4xl p-8"><h1 className="text-4xl font-bold">{String(payload.titleMs ?? "")}</h1><p className="mt-4 text-lg text-slate-600">{String(payload.excerptMs ?? "")}</p><div className="prose mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(String(payload.contentMs ?? "")) }} /></article>;
}
