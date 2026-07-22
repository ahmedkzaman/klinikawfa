import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
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

import { LivePreview } from "@/components/editor/LivePreview";
import { WebsiteMediaUploader } from "@/components/editor/WebsiteMediaUploader";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
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
import { cn } from "@/lib/utils";
import { VersionsPanel } from "@/pages/editor/VersionsPanel";

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
  const cta = form.watch("cta");
  const isBusy = mutation !== null;
  const editorLocked = isBusy || refreshRequired !== null;
  const publishDisabled =
    !editorPage ||
    !editorPage.draft.persisted ||
    isDirty ||
    editorLocked ||
    conflict;

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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {isNew ? "Create page" : "Edit page"}
        </h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Malay content is required. Blank English fields fall back to Malay.
        </p>
      </header>

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
        <div className="sticky top-3 z-20 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {isDirty ? "Unsaved local changes" : "Draft matches saved version"}
            </p>
            {editorPage && (
              <p className="mt-1 text-xs text-slate-500">
                Published revision {editorPage.page.revision} · Draft based on revision {editorPage.draft.baseRevision}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={(!isNew && !isDirty) || editorLocked} type="submit" variant="outline">
              {mutation === "saving" || mutation === "creating" ? (
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="mr-2 h-4 w-4" />
              )}
              Save Draft
            </Button>
            <Button disabled={publishDisabled} onClick={() => setPublishDialogOpen(true)} type="button">
              <Send aria-hidden="true" className="mr-2 h-4 w-4" />
              Publish
            </Button>
          </div>
        </div>

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

      <section aria-labelledby="live-preview-title" className="mt-12 border-t border-slate-200 pt-10">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-2 text-sm font-medium text-slate-700">Preview language</span>
          <Button aria-label="Preview in Malay" aria-pressed={language === "ms"} onClick={() => setLanguage("ms")} size="sm" type="button" variant={language === "ms" ? "default" : "outline"}>Malay</Button>
          <Button aria-label="Preview in English" aria-pressed={language === "en"} onClick={() => setLanguage("en")} size="sm" type="button" variant={language === "en" ? "default" : "outline"}>English</Button>
        </div>
        <LivePreview title={language === "ms" ? "Pratonton Langsung" : "Live Preview"}>
          <GeneralPageRenderer content={previewContent} preview />
        </LivePreview>
      </section>

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
    </div>
  );
}
