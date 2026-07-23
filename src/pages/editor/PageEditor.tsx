import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  get,
  useFieldArray,
  useForm,
  type FieldErrors,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";

import { WebsiteMediaUploader } from "@/components/editor/WebsiteMediaUploader";
import { LayoutEditor } from "@/components/editor/layout/LayoutEditor";
import { AddSectionDialog } from "@/components/editor/sections/AddSectionDialog";
import { SectionList } from "@/components/editor/sections/SectionList";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { EditorNotice } from "@/components/editor/workspace/EditorNotice";
import { EditorWorkspace } from "@/components/editor/workspace/EditorWorkspace";
import { PublishingSidebar } from "@/components/editor/workspace/PublishingSidebar";
import { useRecoverableAutosave } from "@/components/editor/workspace/useRecoverableAutosave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GeneralPageRenderer } from "@/components/website/GeneralPageRenderer";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  createGeneralPage,
  fetchEditorPageById,
  publishPageDraft,
  restorePageVersionToDraft,
  savePageDraft,
  StaleWebsitePageDraftError,
  type EditorWebsitePageResult,
} from "@/features/website-cms/api/pages";
import {
  generalPageContentSchema,
  pageSlugSchema,
  type GeneralPageContent,
} from "@/features/website-cms/schemas/page";
import { createDefaultGeneralPageLayout } from "@/features/website-cms/layout/defaults";
import { GENERAL_PAGE_LAYOUT_KINDS } from "@/features/website-cms/layout/types";
import { cn } from "@/lib/utils";
import { VersionsPanel } from "@/pages/editor/VersionsPanel";
import { pageAdapter } from "@/features/website-cms/resources/pageAdapter";

const NEW_PAGE_CONTENT: GeneralPageContent = {
  title: { ms: "Halaman baharu", en: "" },
  heroImage: null,
  heroAlt: { ms: "", en: "" },
  body: { ms: "<p>Kandungan halaman baharu.</p>", en: "" },
  media: [],
  cta: null,
  seo: {
    title: { ms: "Halaman baharu", en: "" },
    description: { ms: "Maklumat halaman.", en: "" },
  },
  sections: [],
};

type EditorMutation =
  | "creating"
  | "loading"
  | "publishing"
  | "reloading"
  | "restoring"
  | "saving";

type RefreshRequired = "publish" | "restore";

function fieldId(name: string) {
  return `page-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function EditorField({
  errors,
  label,
  multiline = false,
  name,
  readOnly = false,
  register,
}: {
  errors: FieldErrors<GeneralPageContent>;
  label: string;
  multiline?: boolean;
  name: FieldPath<GeneralPageContent>;
  readOnly?: boolean;
  register: UseFormRegister<GeneralPageContent>;
}) {
  const id = fieldId(name);
  const error = (get(errors, name) as { message?: string } | undefined)?.message;
  const shared = {
    "aria-describedby": error ? `${id}-error` : undefined,
    "aria-invalid": Boolean(error),
    id,
    readOnly,
    ...register(name),
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? <Textarea {...shared} rows={6} /> : <Input {...shared} />}
      {error && (
        <p className="text-xs text-red-700" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function BilingualFields({
  base,
  errors,
  label,
  multiline = false,
  register,
}: {
  base: string;
  errors: FieldErrors<GeneralPageContent>;
  label: string;
  multiline?: boolean;
  register: UseFormRegister<GeneralPageContent>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EditorField
        errors={errors}
        label={`${label} (Malay)`}
        multiline={multiline}
        name={`${base}.ms` as FieldPath<GeneralPageContent>}
        register={register}
      />
      <EditorField
        errors={errors}
        label={`${label} (English)`}
        multiline={multiline}
        name={`${base}.en` as FieldPath<GeneralPageContent>}
        register={register}
      />
    </div>
  );
}

export function PageEditor() {
  const navigate = useNavigate();
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const { language, setLanguage } = useLanguage();
  const form = useForm<GeneralPageContent>({
    defaultValues: structuredClone(NEW_PAGE_CONTENT),
    mode: "onBlur",
    resolver: zodResolver(generalPageContentSchema),
  });
  const media = useFieldArray({ control: form.control, name: "media" });
  const [slug, setSlug] = useState("");
  const [initialSlug, setInitialSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [loadedEditorPage, setLoadedEditorPage] = useState<{
    result: EditorWebsitePageResult<GeneralPageContent>;
    routeId: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<EditorMutation | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState<RefreshRequired | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const mutationRef = useRef<EditorMutation | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const routeIdRef = useRef(id);
  const editorPage =
    loadedEditorPage?.routeId === id ? loadedEditorPage.result : null;
  const isDirty = form.formState.isDirty || slug !== initialSlug;

  useEditorDirtyState(isDirty);

  const beginMutation = useCallback((kind: EditorMutation) => {
    if (!mountedRef.current || mutationRef.current !== null) return null;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    mutationRef.current = kind;
    setMutation(kind);
    return generation;
  }, []);

  const isCurrentMutation = useCallback(
    (generation: number) =>
      mountedRef.current && generationRef.current === generation,
    [],
  );

  const finishMutation = useCallback(
    (generation: number) => {
      if (!isCurrentMutation(generation)) return;
      mutationRef.current = null;
      setMutation(null);
    },
    [isCurrentMutation],
  );

  const applyLoadedPage = useCallback(
    (
      result: EditorWebsitePageResult<GeneralPageContent>,
      generation: number,
    ) => {
      if (!isCurrentMutation(generation)) return false;
      if (routeIdRef.current !== id) return false;
      setLoadedEditorPage({ result, routeId: id });
      setSlug(result.page.slug);
      setInitialSlug(result.page.slug);
      form.reset(result.draft.content);
      setConflict(false);
      setRefreshRequired(null);
      return true;
    },
    [form, id, isCurrentMutation],
  );

  const loadPage = useCallback(async () => {
    if (isNew) return true;
    const generation = beginMutation("loading");
    if (generation === null) return false;
    setLoadError(null);
    try {
      return applyLoadedPage(await fetchEditorPageById(id), generation);
    } catch {
      if (isCurrentMutation(generation)) {
        setLoadError("The page draft could not be loaded. Check your connection and try again.");
      }
      return false;
    } finally {
      finishMutation(generation);
    }
  }, [applyLoadedPage, beginMutation, finishMutation, id, isCurrentMutation, isNew]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      mutationRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (routeIdRef.current === id) return;

    routeIdRef.current = id;
    generationRef.current += 1;
    mutationRef.current = null;
    setMutation(null);
    setLoadedEditorPage(null);
    setLoadError(null);
    setSlug("");
    setInitialSlug("");
    setSlugError(null);
    setPublishDialogOpen(false);
    setConflict(false);
    setRefreshRequired(null);
    setNotice(null);
    form.reset(structuredClone(NEW_PAGE_CONTENT));
  }, [form, id]);

  useEffect(() => {
    if (!isNew) void loadPage();
  }, [isNew, loadPage]);

  const saveDraft = async (content: GeneralPageContent) => {
    setSlugError(null);
    setNotice(null);

    if (isNew) {
      const parsedSlug = pageSlugSchema.safeParse(slug);
      if (!parsedSlug.success) {
        setSlugError(parsedSlug.error.issues[0]?.message ?? "Invalid page slug");
        return;
      }
      const generation = beginMutation("creating");
      if (generation === null) return;
      try {
        const created = await createGeneralPage({
          content,
          slug: parsedSlug.data,
        });
        if (!applyLoadedPage(created, generation)) return;
        recovery.clearRecovery();
        setNotice({ message: "Draft saved privately.", tone: "success" });
        navigate(`/editor/pages/${created.page.id}`, { replace: true });
      } catch {
        if (isCurrentMutation(generation)) {
          setNotice({
            message: "Page could not be created. Your local changes are still in this form.",
            tone: "error",
          });
        }
      } finally {
        finishMutation(generation);
      }
      return;
    }

    if (!editorPage) return;
    const generation = beginMutation("saving");
    if (generation === null) return;
    try {
      const saved = await savePageDraft({
        baseRevision: editorPage.draft.baseRevision,
        content,
        pageId: editorPage.page.id,
        slug: editorPage.page.slug,
      });
      if (!isCurrentMutation(generation)) return;
      setLoadedEditorPage((current) =>
        current?.routeId === id
          ? {
              ...current,
              result: {
                ...current.result,
                draft: saved as EditorWebsitePageResult<GeneralPageContent>["draft"],
              },
            }
          : current,
      );
      form.reset(saved.content as GeneralPageContent);
      recovery.clearRecovery();
      setNotice({ message: "Draft saved privately.", tone: "success" });
      setConflict(false);
    } catch {
      if (isCurrentMutation(generation)) {
        setNotice({
          message: "Draft could not be saved. Your local changes are still in this form.",
          tone: "error",
        });
      }
    } finally {
      finishMutation(generation);
    }
  };

  const publishDraft = async () => {
    if (!editorPage) return;
    const generation = beginMutation("publishing");
    if (generation === null) return;
    setNotice(null);
    try {
      try {
        await publishPageDraft({
          expectedRevision: editorPage.draft.baseRevision,
          pageId: editorPage.page.id,
        });
      } catch (error) {
        if (!isCurrentMutation(generation)) return;
        setPublishDialogOpen(false);
        if (error instanceof StaleWebsitePageDraftError) {
          setConflict(true);
        } else {
          setConflict(false);
          setNotice({
            message: "Page could not be published. The saved draft is unchanged. Try again.",
            tone: "error",
          });
        }
        return;
      }

      if (!isCurrentMutation(generation)) return;
      setPublishDialogOpen(false);
      try {
        const result = await fetchEditorPageById(editorPage.page.id);
        if (!applyLoadedPage(result, generation)) return;
        setNotice({ message: "Page published.", tone: "success" });
      } catch {
        if (isCurrentMutation(generation)) setRefreshRequired("publish");
      }
    } finally {
      finishMutation(generation);
    }
  };

  const reloadLatestDraft = async () => {
    if (!editorPage) return;
    if (!window.confirm("Reload the latest private draft and discard any local form changes?")) return;
    const generation = beginMutation("reloading");
    if (generation === null) return;
    setNotice(null);
    try {
      applyLoadedPage(await fetchEditorPageById(editorPage.page.id), generation);
    } catch {
      if (isCurrentMutation(generation)) {
        setNotice({
          message: "The latest draft could not be loaded. Your local changes are still in this form.",
          tone: "error",
        });
      }
    } finally {
      finishMutation(generation);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!editorPage) return false;
    const generation = beginMutation("restoring");
    if (generation === null) return false;
    setNotice(null);
    try {
      try {
        await restorePageVersionToDraft({
          pageId: editorPage.page.id,
          versionId,
        });
      } catch {
        return false;
      }
      if (!isCurrentMutation(generation)) return false;
      try {
        const result = await fetchEditorPageById(editorPage.page.id);
        if (!applyLoadedPage(result, generation)) return false;
        setNotice({
          message: "Version restored to the private draft. Review it before publishing.",
          tone: "success",
        });
      } catch {
        if (!isCurrentMutation(generation)) return false;
        setRefreshRequired("restore");
      }
      return true;
    } finally {
      finishMutation(generation);
    }
  };

  const refreshAfterPartialSuccess = async () => {
    if (!editorPage || !refreshRequired) return;
    const completed = refreshRequired;
    const generation = beginMutation("reloading");
    if (generation === null) return;
    setNotice(null);
    try {
      const result = await fetchEditorPageById(editorPage.page.id);
      if (!applyLoadedPage(result, generation)) return;
      setNotice({
        message:
          completed === "publish"
            ? "Page published. The editor is refreshed."
            : "Version restored to the private draft. Review it before publishing.",
        tone: "success",
      });
    } catch {
      if (isCurrentMutation(generation)) setRefreshRequired(completed);
    } finally {
      finishMutation(generation);
    }
  };

  const toggleCta = (enabled: boolean) => {
    form.setValue(
      "cta",
      enabled
        ? {
            label: { ms: "Ketahui lebih lanjut", en: "Learn more" },
            href: "/",
          }
        : null,
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const previewContent = form.watch() as GeneralPageContent;
  const editableLayout =
    previewContent.layout ?? createDefaultGeneralPageLayout(previewContent);
  const recovery = useRecoverableAutosave({
    key: `page:${id}`,
    value: { content: previewContent, slug },
    serverUpdatedAt: editorPage ? String(editorPage.draft.baseRevision) : null,
    enabled: isDirty,
  });
  const cta = form.watch("cta");
  const sections = form.watch("sections") ?? [];
  const isBusy = mutation !== null;
  const editorLocked = isBusy || refreshRequired !== null;
  const completeness = {
    ms: {
      complete: Boolean(previewContent.title.ms.trim() && previewContent.body.ms.trim()),
      missing: [
        ...(!previewContent.title.ms.trim() ? ["Title"] : []),
        ...(!previewContent.body.ms.trim() ? ["Body"] : []),
      ],
    },
    en: {
      complete: Boolean(previewContent.title.en.trim() && previewContent.body.en.trim()),
      missing: [
        ...(!previewContent.title.en.trim() ? ["Title"] : []),
        ...(!previewContent.body.en.trim() ? ["Body"] : []),
      ],
    },
  };

  const schedulePage = async (scheduledAt: string) => {
    if (!editorPage) return;
    setMutation("publishing");
    try {
      await pageAdapter.schedule(editorPage.page.id, editorPage.draft.baseRevision, scheduledAt);
      setNotice({ message: "Page scheduled for publication.", tone: "success" });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Page could not be scheduled.", tone: "error" });
    } finally {
      setMutation(null);
    }
  };

  const trashPage = async () => {
    if (!editorPage || !window.confirm("Move this page to Trash?")) return;
    setMutation("publishing");
    try {
      await pageAdapter.trash(editorPage.page.id, editorPage.draft.baseRevision);
      setNotice({ message: "Page moved to Trash.", tone: "success" });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "Page could not be moved to Trash.", tone: "error" });
    } finally {
      setMutation(null);
    }
  };

  if (!isNew && !editorPage && !loadError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600" role="status">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Loading page draft
      </div>
    );
  }

  if (!isNew && loadError && !editorPage) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900" role="alert">
        <p>{loadError}</p>
        <Button className="mt-3" onClick={() => void loadPage()} size="sm" type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <EditorWorkspace
        completeness={completeness}
        description="Malay content is required. Blank English fields fall back to Malay."
        editor={<div className="space-y-6">

      {notice && (
        <div
          className={cn(
            "rounded-xl border p-4 text-sm",
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900",
          )}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      )}

      {refreshRequired && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p className="font-semibold">
            {refreshRequired === "publish"
              ? "Published successfully, but the editor could not refresh. Reload before further edits."
              : "Version restored to draft, but refresh failed. Reload before editing."}
          </p>
          <Button className="mt-3" disabled={isBusy} onClick={() => void refreshAfterPartialSuccess()} size="sm" type="button" variant="outline">
            Reload editor
          </Button>
        </div>
      )}

      {conflict && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p className="font-semibold">The live page changed before this draft could publish.</p>
          <p className="mt-1">Reload the latest draft, then merge your local edits before publishing again.</p>
          <Button className="mt-3" disabled={isBusy} onClick={() => void reloadLatestDraft()} size="sm" type="button" variant="outline">
            Reload latest draft
          </Button>
        </div>
      )}

      {recovery.hasRecovery && (
        <EditorNotice tone="warning">
          <p className="font-semibold">Recoverable browser draft found</p>
          <p className="mt-1">You can restore the unsaved content kept safely in this browser.</p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                const recovered = recovery.recoveryValue as { content: GeneralPageContent; slug: string };
                form.reset(recovered.content, { keepDefaultValues: true });
                setSlug(recovered.slug);
                recovery.clearRecovery();
              }}
              size="sm"
              type="button"
            >
              Restore
            </Button>
            <Button onClick={recovery.clearRecovery} size="sm" type="button" variant="outline">Discard</Button>
          </div>
        </EditorNotice>
      )}

      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit(saveDraft, () =>
          setNotice({
            message: "Please fix the highlighted fields before saving the draft.",
            tone: "error",
          }),
        )}
      >
        <fieldset aria-label="General page editable fields" className="space-y-5" disabled={editorLocked}>
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Page identity</h2>
            <div className="space-y-2">
              <Label htmlFor="page-slug">Page slug</Label>
              <Input
                aria-describedby={slugError ? "page-slug-error" : undefined}
                aria-invalid={Boolean(slugError)}
                id="page-slug"
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugError(null);
                }}
                readOnly={!isNew}
                value={slug}
              />
              {slugError && (
                <p className="text-xs text-red-700" id="page-slug-error">
                  {slugError}
                </p>
              )}
              {!isNew && (
                <p className="text-xs text-slate-500">
                  Existing slugs require a separate Administrator-led redirect migration.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Page content</h2>
            <BilingualFields base="title" errors={form.formState.errors} label="Title" register={form.register} />
            <div className="space-y-2">
              <Label htmlFor="page-hero-image">Hero image URL</Label>
              <Input
                id="page-hero-image"
                {...form.register("heroImage", {
                  setValueAs: (value: unknown) =>
                    typeof value === "string" && value.trim() ? value : null,
                })}
              />
              {(form.formState.errors.heroImage as { message?: string } | undefined)?.message && (
                <p className="text-xs text-red-700">
                  {(form.formState.errors.heroImage as { message?: string }).message}
                </p>
              )}
              <WebsiteMediaUploader folder="pages" onUploaded={(url) => form.setValue("heroImage", url, { shouldDirty: true, shouldValidate: true })} />
            </div>
            <BilingualFields base="heroAlt" errors={form.formState.errors} label="Hero image alt text" register={form.register} />
            <BilingualFields base="body" errors={form.formState.errors} label="Rich HTML body" multiline register={form.register} />
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Media</h2>
                <p className="mt-1 text-xs text-slate-500">Only allowlisted image and video entries render publicly.</p>
              </div>
              <Button
                disabled={media.fields.length >= 12}
                onClick={() => media.append({ type: "image", url: "/images/placeholder.webp", alt: { ms: "", en: "" } })}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                Add media
              </Button>
            </div>
            {media.fields.map((item, index) => (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4" key={item.id}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Media {index + 1}</h3>
                  <Button aria-label={`Remove media ${index + 1}`} onClick={() => media.remove(index)} size="sm" type="button" variant="ghost">
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`page-media-${index}-type`}>Media type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    id={`page-media-${index}-type`}
                    {...form.register(`media.${index}.type`)}
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                  </select>
                </div>
                <EditorField errors={form.formState.errors} label={`Media ${index + 1} URL`} name={`media.${index}.url`} register={form.register} />
                <BilingualFields base={`media.${index}.alt`} errors={form.formState.errors} label={`Media ${index + 1} alt text`} register={form.register} />
              </div>
            ))}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Page sections</h2>
                <p className="mt-1 text-xs text-slate-500">Build the page using guided, reusable blocks. Hidden sections remain in the draft but do not appear publicly.</p>
              </div>
              <AddSectionDialog onAdd={(section) => form.setValue("sections", [...sections, section], { shouldDirty: true, shouldValidate: true })} />
            </div>
            {sections.length ? (
              <SectionList language={language} onChange={(next) => form.setValue("sections", next, { shouldDirty: true, shouldValidate: true })} sections={sections} />
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No guided sections yet. Add one to begin.</p>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-900">
              <input checked={Boolean(cta)} onChange={(event) => toggleCta(event.target.checked)} type="checkbox" />
              Show call to action
            </label>
            {cta && (
              <>
                <BilingualFields base="cta.label" errors={form.formState.errors} label="CTA label" register={form.register} />
                <EditorField errors={form.formState.errors} label="CTA URL" name="cta.href" register={form.register} />
              </>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Search appearance</h2>
            <BilingualFields base="seo.title" errors={form.formState.errors} label="SEO title" register={form.register} />
            <BilingualFields base="seo.description" errors={form.formState.errors} label="SEO description" multiline register={form.register} />
          </section>
        </fieldset>

        <LayoutEditor
          allowedKinds={GENERAL_PAGE_LAYOUT_KINDS}
          blockLabels={{
            title: "Page title",
            hero: "Hero media",
            body: "Main content",
            media: "Media gallery",
            cta: "Call to action",
          }}
          layout={editableLayout}
          onChange={(layout) =>
            form.setValue("layout", layout, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          protectedBlockIds={new Set(
            editableLayout.blocks.map((block) => block.id),
          )}
        />

        {editorPage && (
          <VersionsPanel
            disabled={editorLocked}
            isRestoring={mutation === "restoring"}
            onRestore={restoreVersion}
            pageId={editorPage.page.id}
            pageLabel="page"
          />
        )}
      </form>
      </div>}
        language={language}
        onLanguageChange={setLanguage}
        preview={<GeneralPageRenderer content={previewContent} preview />}
        publishing={
          <PublishingSidebar
            busy={isBusy}
            completeness={completeness}
            dirty={isDirty}
            onPreview={() => document.querySelector('[aria-label="Live Preview"]')?.scrollIntoView({ behavior: "smooth" })}
            onPublish={async () => { setPublishDialogOpen(true); }}
            onSaveDraft={async () => { await form.handleSubmit(saveDraft)(); }}
            onSchedule={schedulePage}
            onTrash={trashPage}
            revision={editorPage?.draft.baseRevision ?? 0}
            scheduledAt={editorPage?.page.scheduledAt ?? null}
            status={editorPage?.page.status === "published" || editorPage?.page.status === "scheduled" || editorPage?.page.status === "trash" ? editorPage.page.status : "draft"}
          />
        }
        title={isNew ? "Create page" : "Edit page"}
      />

      {publishDialogOpen && (
        <div aria-label="Publish page?" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog">
          <div className="max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Publish page?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This atomically replaces the live content with the saved private draft and records the previous revision. Unsaved local changes are never included.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={mutation === "publishing"} onClick={() => setPublishDialogOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button disabled={mutation === "publishing"} onClick={() => void publishDraft()} type="button">
                Publish now
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
