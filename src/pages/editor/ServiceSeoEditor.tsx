import { Languages, Loader2, Save, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { SeoPanel } from "@/components/editor/seo/SeoPanel";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchServiceSeoForEditor,
  publishServiceSeo,
  saveServiceSeoDraft,
} from "@/features/website-cms/service-seo/api";
import {
  getServiceSeoTargetById,
  serviceSeoCanonicalUrl,
  serviceSeoPayloadSchema,
  type ServiceSeoPayload,
} from "@/features/website-cms/service-seo/domain";

type Notice = { tone: "error" | "success"; text: string };

export function ServiceSeoEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const target = getServiceSeoTargetById(id);
  const [value, setValue] = useState<ServiceSeoPayload | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [language, setLanguage] = useState<"ms" | "en">("ms");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "publish" | "generate" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  useEditorDirtyState(dirty);

  useEffect(() => {
    if (!target) {
      setNotice({ tone: "error", text: "Service SEO target was not found." });
      return;
    }
    let active = true;
    void fetchServiceSeoForEditor(target.id)
      .then((result) => {
        if (!active) return;
        setValue(result.payload);
        setBaseRevision(result.revision);
      })
      .catch(() => { if (active) setNotice({ tone: "error", text: "Service SEO could not be loaded." }); });
    return () => { active = false; };
  }, [target]);

  const update = (next: ServiceSeoPayload) => {
    setValue(next);
    setDirty(true);
    setNotice(null);
  };

  const validate = () => value ? serviceSeoPayloadSchema.safeParse(value) : null;

  const save = async () => {
    const parsed = validate();
    if (!parsed?.success) {
      setNotice({ tone: "error", text: parsed?.error.issues[0]?.message ?? "Complete the SEO fields." });
      return;
    }
    setBusy("save");
    try {
      const saved = await saveServiceSeoDraft(id, baseRevision, parsed.data);
      setValue(saved.payload);
      setBaseRevision(saved.baseRevision);
      setDirty(false);
      setNotice({ tone: "success", text: "SEO draft saved privately." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "SEO draft could not be saved." });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const parsed = validate();
    if (!parsed?.success) {
      setNotice({ tone: "error", text: parsed?.error.issues[0]?.message ?? "Complete the SEO fields." });
      return;
    }
    setBusy("publish");
    try {
      const saved = await saveServiceSeoDraft(id, baseRevision, parsed.data);
      const revision = await publishServiceSeo(id, saved.baseRevision);
      setValue(saved.payload);
      setBaseRevision(revision);
      setDirty(false);
      setNotice({ tone: "success", text: "SEO published. Browser metadata updates now; crawler HTML refreshes within about one hour." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "SEO could not be published." });
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!value || !target) return;
    setBusy("generate");
    setNotice(null);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.functions.invoke("generate-service-seo", {
        body: {
          path: target.path,
          titleMs: target.labelMs,
          titleEn: target.labelEn,
          focusPhraseMs: value.focusPhraseMs,
          focusPhraseEn: value.focusPhraseEn,
        },
      });
      if (error) throw error;
      const generated = data as { ms?: Record<string, string>; en?: Record<string, string> };
      const required = ["title", "description", "socialTitle", "socialDescription"] as const;
      if (!generated.ms || !generated.en || required.some((key) => !generated.ms?.[key] || !generated.en?.[key])) {
        throw new Error("AI returned incomplete SEO suggestions.");
      }
      setValue((current) => current ? {
        ...current,
        seoMs: { ...current.seoMs, ...generated.ms },
        seoEn: { ...current.seoEn, ...generated.en },
      } as ServiceSeoPayload : current);
      setDirty(true);
      setNotice({ tone: "success", text: "AI suggestions added to this draft. Review them before saving or publishing." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "SEO suggestions could not be generated." });
    } finally {
      setBusy(null);
    }
  };

  if (!target || !value) {
    return <div className="rounded-xl border bg-white p-5 text-sm text-slate-600" role={notice?.tone === "error" ? "alert" : "status"}>{notice?.tone === "error" ? notice.text : <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading service SEO</>}</div>;
  }

  const seo = language === "ms" ? value.seoMs : value.seoEn;
  const focusPhrase = language === "ms" ? value.focusPhraseMs : value.focusPhraseEn;
  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Service SEO</p>
          <h1 className="mt-1 text-2xl font-semibold">{target.labelMs}</h1>
          <p className="mt-1 text-sm text-slate-600">{target.labelEn}</p>
          <p className="mt-1 text-xs text-slate-500">revision {baseRevision}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/editor/services")} variant="outline">Back</Button>
          <Button disabled={Boolean(busy)} onClick={() => void save()} variant="outline"><Save className="mr-2 h-4 w-4" />Save draft</Button>
          <Button disabled={Boolean(busy)} onClick={() => void publish()}><Send className="mr-2 h-4 w-4" />Publish SEO</Button>
        </div>
      </header>
      {notice && <p className={`rounded-lg border p-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
      <div className="flex w-fit rounded-lg border bg-white p-1" aria-label="SEO language">
        <Button onClick={() => setLanguage("ms")} size="sm" variant={language === "ms" ? "default" : "ghost"}>Bahasa Melayu</Button>
        <Button onClick={() => setLanguage("en")} size="sm" variant={language === "en" ? "default" : "ghost"}>English</Button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <Label htmlFor="service-seo-focus">Target search phrase ({language === "ms" ? "Malay" : "English"})</Label>
        <Input
          className="mt-2"
          id="service-seo-focus"
          maxLength={160}
          onChange={(event) => update({ ...value, [language === "ms" ? "focusPhraseMs" : "focusPhraseEn"]: event.target.value })}
          placeholder={language === "ms" ? "contoh: klinik kuantan" : "example: clinic Kuantan"}
          value={focusPhrase}
        />
        <p className="mt-1 text-xs text-slate-500">Used for editorial guidance and AI drafting; Google does not use a meta-keywords tag.</p>
      </div>
      <SeoPanel
        canonicalReadOnly
        canonicalUrl={serviceSeoCanonicalUrl(target.path)}
        headerAction={<Button disabled={Boolean(busy)} onClick={() => void generate()} size="sm" variant="outline"><Sparkles className="mr-2 h-4 w-4" />{busy === "generate" ? "Generating…" : "Generate SEO with AI"}</Button>}
        language={language}
        mediaFolder="services"
        onChange={(nextSeo) => update({ ...value, [language === "ms" ? "seoMs" : "seoEn"]: nextSeo })}
        value={seo}
      />
      <p className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Languages className="mt-0.5 h-4 w-4 shrink-0" />Malay remains the default crawler-facing language. English metadata is shown when the visitor selects English.</p>
    </section>
  );
}
