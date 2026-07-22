import { Loader2, Save, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { LivePreview } from "@/components/editor/LivePreview";
import { WebsiteMediaUploader } from "@/components/editor/WebsiteMediaUploader";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchServiceResource, publishResourceDraft, saveResourceDraft } from "@/features/website-cms/api/resources";
import { serviceDraftSchema, type ServiceDraft } from "@/features/website-cms/resources/schemas";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";

export function ServiceEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState<ServiceDraft | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEditorDirtyState(dirty);

  useEffect(() => {
    let active = true;
    void fetchServiceResource(id).then((result) => { if (active) { setValue(result.draft); setBaseRevision(result.revision); } }).catch(() => { if (active) setNotice({ tone: "error", text: "Service content could not be loaded." }); });
    return () => { active = false; };
  }, [id]);

  const update = <K extends keyof ServiceDraft>(key: K, next: ServiceDraft[K]) => { setValue((current) => current ? { ...current, [key]: next } : current); setDirty(true); setNotice(null); };
  const validate = () => value ? serviceDraftSchema.safeParse(value) : null;
  const save = async () => {
    const parsed = validate(); if (!parsed?.success) { setNotice({ tone: "error", text: parsed?.error.issues[0]?.message ?? "Complete the required fields." }); return; }
    setBusy("save"); try { const saved = await saveResourceDraft({ baseRevision, payload: parsed.data, resourceId: id, resourceType: "service", updatedAt: null }); setValue(saved.payload); setDirty(false); setNotice({ tone: "success", text: "Draft saved privately." }); } catch { setNotice({ tone: "error", text: "Draft could not be saved. Your changes remain in this form." }); } finally { setBusy(null); }
  };
  const publish = async () => {
    const parsed = validate(); if (!parsed?.success) { setNotice({ tone: "error", text: parsed?.error.issues[0]?.message ?? "Complete the required fields." }); return; }
    setBusy("publish"); try { await saveResourceDraft({ baseRevision, payload: parsed.data, resourceId: id, resourceType: "service", updatedAt: null }); const revision = await publishResourceDraft("service", id, baseRevision); setBaseRevision(revision); setDirty(false); setNotice({ tone: "success", text: "Service published successfully." }); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Service could not be published." }); } finally { setBusy(null); }
  };

  if (!value) return <div className="rounded-xl border bg-white p-5 text-sm text-slate-600" role="status">{notice?.tone === "error" ? notice.text : <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading service</>}</div>;
  return <section className="space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-medium text-blue-700">Service category</p><h1 className="mt-1 text-2xl font-semibold">{value.titleMs}</h1><p className="mt-1 text-xs text-slate-500">{value.slug} · revision {baseRevision}</p></div><div className="flex gap-2"><Button onClick={() => navigate("/editor/services")} variant="outline">Back</Button><Button disabled={Boolean(busy)} onClick={() => void save()} variant="outline"><Save className="mr-2 h-4 w-4" />Save draft</Button><Button disabled={Boolean(busy)} onClick={() => void publish()}><Send className="mr-2 h-4 w-4" />Publish</Button></div></header>
    {notice && <p className={`rounded-lg border p-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <Bilingual label="Title" ms={value.titleMs} en={value.titleEn} onMs={(x) => update("titleMs",x)} onEn={(x) => update("titleEn",x)} />
      <Bilingual label="Description (rich HTML)" ms={value.descriptionMs} en={value.descriptionEn} multiline onMs={(x) => update("descriptionMs",x)} onEn={(x) => update("descriptionEn",x)} />
      <Bilingual label="Call to action" ms={value.ctaMs} en={value.ctaEn} onMs={(x) => update("ctaMs",x)} onEn={(x) => update("ctaEn",x)} />
      <div className="grid gap-4 md:grid-cols-2"><ListField label="Service bullets (Malay)" value={value.servicesMs} onChange={(x) => update("servicesMs",x)} /><ListField label="Service bullets (English, optional)" value={value.servicesEn} onChange={(x) => update("servicesEn",x)} /></div>
      <div className="grid gap-4 md:grid-cols-2"><div><Field label="Hero image URL" value={value.heroImageUrl ?? ""} onChange={(x) => update("heroImageUrl",x)} /><WebsiteMediaUploader folder="services" onUploaded={(url) => update("heroImageUrl",url)} /></div><Field label="YouTube or public video URL" value={value.promoVideoUrl ?? ""} onChange={(x) => update("promoVideoUrl",x)} /></div>
    </div>
    <LivePreview title="Service live preview"><article className="mx-auto max-w-4xl px-6 py-12"><p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Klinik Awfa</p><h1 className="mt-2 text-4xl font-bold text-slate-950">{value.titleMs}</h1><div className="service-rich-content prose mt-6 max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(value.descriptionMs) }} /><ul className="mt-8 grid gap-3 sm:grid-cols-2">{value.servicesMs.map((item) => <li className="rounded-lg border bg-white p-4 text-slate-800" key={item}>{item}</li>)}</ul><p className="mt-8 inline-flex rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white">{value.ctaMs}</p></article></LivePreview>
  </section>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const id = `service-${label.replace(/\W/g,"-").toLowerCase()}`; return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} onChange={(e) => onChange(e.target.value)} value={value} /></div>; }
function Bilingual({ label, ms, en, onMs, onEn, multiline=false }: { label:string; ms:string; en:string; onMs:(v:string)=>void; onEn:(v:string)=>void; multiline?:boolean }) { return <div className="grid gap-4 md:grid-cols-2">{multiline ? <><div className="space-y-2"><Label>{label} (Malay)</Label><Textarea rows={7} value={ms} onChange={(e)=>onMs(e.target.value)} /></div><div className="space-y-2"><Label>{label} (English)</Label><Textarea rows={7} value={en} onChange={(e)=>onEn(e.target.value)} /></div></> : <><Field label={`${label} (Malay)`} value={ms} onChange={onMs}/><Field label={`${label} (English)`} value={en} onChange={onEn}/></>}</div>; }
function ListField({ label, value, onChange }: { label:string; value:string[]; onChange:(v:string[])=>void }) { return <div className="space-y-2"><Label>{label}</Label><Textarea rows={8} value={value.join("\n")} onChange={(e)=>onChange(e.target.value.split("\n").map((x)=>x.trim()).filter(Boolean))}/><p className="text-xs text-slate-500">One item per line.</p></div>; }
