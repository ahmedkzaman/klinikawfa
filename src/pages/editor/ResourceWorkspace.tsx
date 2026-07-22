import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ContentListPage } from "@/components/editor/content-list/ContentListPage";
import { MediaSelectorDialog } from "@/components/editor/media/MediaSelectorDialog";
import { PostTaxonomyFields } from "@/components/editor/posts/PostTaxonomyFields";
import { SeoPanel } from "@/components/editor/seo/SeoPanel";
import { WebsiteMediaUploader } from "@/components/editor/WebsiteMediaUploader";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { EditorNotice } from "@/components/editor/workspace/EditorNotice";
import { EditorWorkspace } from "@/components/editor/workspace/EditorWorkspace";
import { PublishingSidebar } from "@/components/editor/workspace/PublishingSidebar";
import { useRecoverableAutosave } from "@/components/editor/workspace/useRecoverableAutosave";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchResourceForEditor, newResourceId, publishResourceDraft, saveResourceDraft } from "@/features/website-cms/api/resources";
import { parseWebsiteResourceDraft } from "@/features/website-cms/resources/registry";
import { createWebsiteResourceAdapter } from "@/features/website-cms/resources/adapters";
import type { WebsiteResourceType } from "@/features/website-cms/resources/types";
import { prepareResourcePayloadForPublish } from "@/features/website-cms/resources/publishing";
import { sanitizeRichHtml } from "@/lib/sanitize-rich-html";
import { ResourceVersionsPanel } from "@/pages/editor/ResourceVersionsPanel";

type EditableType = Exclude<WebsiteResourceType, "service">;
type FieldKind = "boolean" | "list" | "number" | "richtext" | "select" | "text" | "textarea";
interface FieldDefinition { key: string; kind: FieldKind; label: string; options?: string[]; required?: boolean; }
interface ResourceConfig { singular: string; plural: string; route: string; type: EditableType; fields: FieldDefinition[]; defaults: Record<string, unknown>; }

const configs: Record<EditableType, ResourceConfig> = {
  team_member: { type:"team_member", route:"team", singular:"profile", plural:"Team", defaults:{ type:"doctor",nameMs:"",nameEn:"",titleMs:"",titleEn:"",bioMs:"",bioEn:"",expertiseMs:[],expertiseEn:[],qualifications:[],yearsExperience:0,photoUrl:"",isActive:true,displayOrder:0 }, fields:[{key:"type",label:"Profile type",kind:"select",options:["doctor","team"]},{key:"nameMs",label:"Name (Malay)",kind:"text",required:true},{key:"nameEn",label:"Name (English)",kind:"text"},{key:"titleMs",label:"Title (Malay)",kind:"text",required:true},{key:"titleEn",label:"Title (English)",kind:"text"},{key:"bioMs",label:"Biography (Malay)",kind:"textarea",required:true},{key:"bioEn",label:"Biography (English)",kind:"textarea"},{key:"expertiseMs",label:"Expertise (Malay, one per line)",kind:"list"},{key:"expertiseEn",label:"Expertise (English, one per line)",kind:"list"},{key:"qualifications",label:"Qualifications (one per line)",kind:"list"},{key:"yearsExperience",label:"Years of experience",kind:"number"},{key:"photoUrl",label:"Photo URL",kind:"text"},{key:"isActive",label:"Visible on website",kind:"boolean"},{key:"displayOrder",label:"Display order",kind:"number"}] },
  blog_post: { type:"blog_post",route:"posts",singular:"post",plural:"Posts",defaults:{slug:"",titleMs:"",titleEn:"",excerptMs:"",excerptEn:"",contentMs:"",contentEn:"",categoryId:null,tagIds:[],authorId:null,featuredImage:"",featuredImageMediaId:null,readingTime:1,status:"draft",scheduledAt:null},fields:[{key:"slug",label:"Slug",kind:"text",required:true},{key:"titleMs",label:"Post title in Bahasa Melayu",kind:"text",required:true},{key:"titleEn",label:"Post title in English",kind:"text"},{key:"excerptMs",label:"Excerpt in Bahasa Melayu",kind:"textarea",required:true},{key:"excerptEn",label:"Excerpt in English",kind:"textarea"},{key:"contentMs",label:"Post body in Bahasa Melayu",kind:"richtext",required:true},{key:"contentEn",label:"Post body in English",kind:"richtext"},{key:"featuredImage",label:"Featured image URL",kind:"text"},{key:"readingTime",label:"Reading time (minutes)",kind:"number"}] },
  gallery_image: { type:"gallery_image",route:"gallery",singular:"item",plural:"Gallery",defaults:{url:"",altMs:"",altEn:"",tags:[],displayOrder:0,visible:true},fields:[{key:"url",label:"Image, video or YouTube URL",kind:"text",required:true},{key:"altMs",label:"Alt text (Malay)",kind:"text",required:true},{key:"altEn",label:"Alt text (English)",kind:"text"},{key:"tags",label:"Tags (one per line)",kind:"list"},{key:"displayOrder",label:"Display order",kind:"number"},{key:"visible",label:"Visible on website",kind:"boolean"}] },
  review: { type:"review",route:"reviews",singular:"review",plural:"Reviews",defaults:{nameMs:"",nameEn:"",reviewTextMs:"",reviewTextEn:"",rating:5,sourceLabel:"Klinik Awfa",status:"draft",displayOrder:0},fields:[{key:"nameMs",label:"Public display name (Malay)",kind:"text",required:true},{key:"nameEn",label:"Public display name (English)",kind:"text"},{key:"reviewTextMs",label:"Review (Malay)",kind:"textarea",required:true},{key:"reviewTextEn",label:"Review (English)",kind:"textarea"},{key:"rating",label:"Rating (1–5)",kind:"number"},{key:"sourceLabel",label:"Source label",kind:"text",required:true},{key:"status",label:"Publication status",kind:"select",options:["draft","published","archived"]},{key:"displayOrder",label:"Display order",kind:"number"}] },
};

const resourceAdapters = {
  team_member: createWebsiteResourceAdapter("team_member"),
  blog_post: createWebsiteResourceAdapter("blog_post"),
  gallery_image: createWebsiteResourceAdapter("gallery_image"),
  review: createWebsiteResourceAdapter("review"),
} as const;

export function ResourceListPage({ type }: { type: EditableType }) {
  const config = configs[type];
  return <ContentListPage adapter={resourceAdapters[type]} resourceLabel={config.plural} createHref={`/editor/${config.route}/new`} />;
}

export function ResourceEditorPage({ type }: { type: EditableType }) {
  const config = configs[type];
  const adapter = resourceAdapters[type];
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const resourceId = useMemo(() => (isNew ? newResourceId() : id), [id, isNew]);
  const navigate = useNavigate();
  const [language, setLanguage] = useState<"ms" | "en">("ms");
  const [value, setValue] = useState<Record<string, unknown>>({ ...config.defaults });
  const [revision, setRevision] = useState(0);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "scheduled" | "published" | "trash">("draft");
  const [loading, setLoading] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "warning"; text: string } | null>(null);
  useEditorDirtyState(dirty);

  const recovery = useRecoverableAutosave({
    key: `${type}:${resourceId}`,
    value,
    serverUpdatedAt,
    enabled: dirty,
  });

  const completeness = useMemo(() => {
    const requiredFor = (suffix: "Ms" | "En") => config.fields
      .filter((field) => field.required && field.key.endsWith(suffix))
      .filter((field) => !String(value[field.key] ?? "").trim())
      .map((field) => field.label.replace(/ \((Malay|English)\)$/, ""));
    const ms = requiredFor("Ms");
    const en = requiredFor("En");
    return {
      ms: { complete: ms.length === 0, missing: ms },
      en: { complete: en.length === 0, missing: en },
    };
  }, [config.fields, value]);

  const reload = async () => {
    const result = await fetchResourceForEditor(type, resourceId);
    if (!result) throw new Error("not found");
    setValue(result.payload as unknown as Record<string, unknown>);
    setRevision(result.revision);
    setServerUpdatedAt(null);
    setDirty(false);
  };

  useEffect(() => {
    if (isNew) {
      setValue({ ...config.defaults });
      setRevision(0);
      setServerUpdatedAt(null);
      setStatus("draft");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void adapter.load(id).then((result) => {
      if (!active) return;
      setValue(result.payload as Record<string, unknown>);
      setRevision(result.baseRevision);
      setServerUpdatedAt(result.updatedAt ?? null);
      const payloadStatus = result.lifecycleStatus ?? (result.payload as { status?: string }).status;
      setStatus(payloadStatus === "scheduled" || payloadStatus === "published" || payloadStatus === "trash" ? payloadStatus : "draft");
    }).catch(() => {
      if (active) setNotice({ tone: "error", text: `This ${config.singular} could not be loaded.` });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [adapter, config.defaults, config.singular, id, isNew]);

  const update = (key: string, next: unknown) => {
    setValue((current) => ({ ...current, [key]: next }));
    setDirty(true);
    setNotice(null);
  };
  const validated = () => {
    try {
      return parseWebsiteResourceDraft(type, value);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Complete all required fields." });
      return null;
    }
  };
  const save = async () => {
    const payload = validated();
    if (!payload) return;
    setBusy(true);
    try {
      const saved = await saveResourceDraft({ baseRevision: revision, payload, resourceId, resourceType: type, updatedAt: serverUpdatedAt });
      setServerUpdatedAt(saved.updatedAt);
      setDirty(false);
      recovery.clearRecovery();
      setNotice({ tone: "success", text: "Draft saved privately." });
      if (isNew) navigate(`/editor/${config.route}/${resourceId}`, { replace: true });
    } catch {
      setNotice({ tone: "error", text: "Draft could not be saved. Your changes remain in this form." });
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (dirty) return;
    const payload = validated();
    if (!payload) return;
    setBusy(true);
    try {
      const publishPayload = prepareResourcePayloadForPublish(type, payload as Record<string, unknown>);
      await saveResourceDraft({
        baseRevision: revision,
        payload: publishPayload,
        resourceId,
        resourceType: type,
        updatedAt: serverUpdatedAt,
      });
      const next = await publishResourceDraft(type, resourceId, revision);
      setValue(publishPayload);
      setRevision(next);
      setServerUpdatedAt(null);
      setStatus("published");
      setNotice({ tone: "success", text: `${config.singular[0].toUpperCase() + config.singular.slice(1)} published successfully.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Content could not be published." });
    } finally {
      setBusy(false);
    }
  };
  const schedule = async (scheduledAt: string) => {
    setBusy(true);
    try {
      await adapter.schedule(resourceId, revision, scheduledAt);
      setStatus("scheduled");
      setNotice({ tone: "success", text: "Publication scheduled." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Content could not be scheduled." });
    } finally {
      setBusy(false);
    }
  };
  const trash = async () => {
    if (!window.confirm(`Move this ${config.singular} to Trash?`)) return;
    setBusy(true);
    try {
      await adapter.trash(resourceId, revision);
      setStatus("trash");
      setNotice({ tone: "success", text: "Content moved to Trash." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Content could not be moved to Trash." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="rounded-xl border bg-white p-5 text-sm" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading {config.singular}</p>;

  const visibleFields = config.fields.filter((field) => {
    if (field.key.endsWith("Ms")) return language === "ms";
    if (field.key.endsWith("En")) return language === "en";
    return true;
  });
  const editor = (
    <div className="space-y-5">
      {notice && <EditorNotice tone={notice.tone}>{notice.text}</EditorNotice>}
      {recovery.hasRecovery && (
        <EditorNotice tone="warning">
          <p className="font-semibold">Recoverable browser draft found</p>
          <p className="mt-1">Restore the unsaved version from {recovery.recoveredAt ? new Date(recovery.recoveredAt).toLocaleString() : "this browser"}?</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => { setValue(recovery.recoveryValue as Record<string, unknown>); setDirty(true); recovery.clearRecovery(); }} size="sm" type="button">Restore</Button>
            <Button onClick={recovery.clearRecovery} size="sm" type="button" variant="outline">Discard</Button>
          </div>
        </EditorNotice>
      )}
      <div className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        {visibleFields.map((field) => (
          <div key={field.key}>
            <ResourceField field={field} onChange={(next) => update(field.key, next)} value={value[field.key]} />
            {["photoUrl", "url"].includes(field.key) && (
              <WebsiteMediaUploader folder={type === "team_member" ? "team" : type === "blog_post" ? "blog" : "gallery"} onUploaded={(url) => update(field.key, url)} />
            )}
            {type === "blog_post" && field.key === "featuredImage" && (
              <div className="mt-2"><MediaSelectorDialog folder="blog" label="Choose featured image" onSelect={(media) => { update("featuredImage", media.publicUrl); update("featuredImageMediaId", media.id); }} /></div>
            )}
          </div>
        ))}
        {type === "blog_post" && (
          <PostTaxonomyFields
            categoryId={typeof value.categoryId === "string" ? value.categoryId : null}
            onCategoryChange={(next) => update("categoryId", next)}
            onTagsChange={(next) => update("tagIds", next)}
            tagIds={Array.isArray(value.tagIds) ? value.tagIds.filter((item): item is string => typeof item === "string") : []}
          />
        )}
      </div>
      {type === "blog_post" && (
        <SeoPanel language={language} onChange={(next) => update(language === "ms" ? "seoMs" : "seoEn", next)} value={(value[language === "ms" ? "seoMs" : "seoEn"] ?? { title:"", description:"", canonicalUrl:"", socialTitle:"", socialDescription:"", socialImageMediaId:null, index:true, follow:true }) as import("@/features/website-cms/domain/seo").SeoFields} />
      )}
      {!isNew && <ResourceVersionsPanel disabled={busy || dirty} onRestored={reload} resourceId={resourceId} resourceLabel={config.singular} resourceType={type} />}
    </div>
  );

  return (
    <EditorWorkspace
      completeness={completeness}
      description="Edit the content, save it privately, then preview before publishing."
      editor={editor}
      language={language}
      onLanguageChange={setLanguage}
      preview={<ResourcePreview type={type} value={value} />}
      publishing={
        <PublishingSidebar
          busy={busy}
          completeness={completeness}
          dirty={dirty}
          onPreview={() => document.querySelector('[aria-label="Live Preview"]')?.scrollIntoView({ behavior: "smooth" })}
          onPublish={publish}
          onSaveDraft={save}
          onSchedule={schedule}
          onTrash={trash}
          revision={revision}
          scheduledAt={typeof value.scheduledAt === "string" ? value.scheduledAt : null}
          status={status}
        />
      }
      title={isNew ? `New ${config.singular}` : String(value.nameMs ?? value.titleMs ?? value.altMs ?? "Edit content")}
    />
  );
}

function ResourceField({field,value,onChange}:{field:FieldDefinition;value:unknown;onChange:(value:unknown)=>void}){const id=`resource-${field.key}`;if(field.kind==="boolean")return <label className="flex items-center gap-3 rounded-lg border p-4"><input checked={Boolean(value)} onChange={(e)=>onChange(e.target.checked)} type="checkbox"/><span className="text-sm font-medium">{field.label}</span></label>;if(field.kind==="select")return <div className="space-y-2"><Label htmlFor={id}>{field.label}</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" id={id} value={String(value??"")} onChange={(e)=>onChange(e.target.value)}>{field.options?.map((option)=><option key={option} value={option}>{option}</option>)}</select></div>;if(field.kind==="list")return <div className="space-y-2"><Label htmlFor={id}>{field.label}</Label><Textarea id={id} rows={5} value={Array.isArray(value)?value.join("\n"):""} onChange={(e)=>onChange(e.target.value.split("\n").map((x)=>x.trim()).filter(Boolean))}/></div>;if(field.kind==="richtext")return <div className="space-y-2 md:col-span-2"><Label>{field.label}{field.required?" *":""}</Label><RichTextEditor onChange={onChange} placeholder="Write post content" value={String(value??"")}/></div>;if(field.kind==="textarea")return <div className="space-y-2 md:col-span-2"><Label htmlFor={id}>{field.label}{field.required?" *":""}</Label><Textarea id={id} rows={7} value={String(value??"")} onChange={(e)=>onChange(e.target.value)}/></div>;return <div className="space-y-2"><Label htmlFor={id}>{field.label}{field.required?" *":""}</Label><Input id={id} type={field.kind==="number"?"number":"text"} value={String(value??"")} onChange={(e)=>onChange(field.kind==="number"?Number(e.target.value):e.target.value)}/></div>}

function ResourcePreview({type,value}:{type:EditableType;value:Record<string,unknown>}){if(type==="review")return <figure className="mx-auto max-w-xl px-6 py-16 text-center"><div className="text-amber-500">{"★".repeat(Number(value.rating??5))}</div><blockquote className="mt-5 text-xl leading-8 text-slate-800">“{String(value.reviewTextMs??"")}”</blockquote><figcaption className="mt-4 font-semibold">{String(value.nameMs??"")}</figcaption></figure>;if(type==="gallery_image")return <figure className="mx-auto max-w-3xl p-8">{String(value.url??"").match(/\.(mp4|webm)$/i)?<video className="w-full rounded-xl" controls={false} src={String(value.url)}/>:<img alt={String(value.altMs??"")} className="max-h-[560px] w-full rounded-xl object-cover" src={String(value.url??"")}/>}<figcaption className="mt-3 text-sm text-slate-600">{String(value.altMs??"")}</figcaption></figure>;if(type==="team_member")return <article className="mx-auto max-w-3xl px-6 py-14 text-center">{value.photoUrl&&<img alt={String(value.nameMs??"")} className="mx-auto h-40 w-40 rounded-full object-cover" src={String(value.photoUrl)}/>}<h1 className="mt-5 text-3xl font-bold">{String(value.nameMs??"")}</h1><p className="mt-2 font-medium text-blue-700">{String(value.titleMs??"")}</p><p className="mt-5 leading-7 text-slate-700">{String(value.bioMs??"")}</p></article>;return <article className="mx-auto max-w-3xl px-6 py-14"><h1 className="text-4xl font-bold">{String(value.titleMs??"")}</h1><p className="mt-4 text-lg text-slate-600">{String(value.excerptMs??"")}</p><div className="prose mt-8 max-w-none" dangerouslySetInnerHTML={{__html:sanitizeRichHtml(String(value.contentMs??""))}}/></article>}
