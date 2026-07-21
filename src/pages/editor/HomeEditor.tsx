import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  get,
  useFieldArray,
  useForm,
  type FieldErrors,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form";

import { LivePreview } from "@/components/editor/LivePreview";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { HomeRenderer } from "@/components/home";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  fetchEditorPage,
  publishPageDraft,
  restorePageVersionToDraft,
  savePageDraft,
  StaleWebsitePageDraftError,
  type EditorWebsitePageResult,
} from "@/features/website-cms/api/pages";
import { DEFAULT_HOME_CONTENT } from "@/features/website-cms/home/homeDefaults";
import { projectHomePreview } from "@/features/website-cms/home/projectHomePreview";
import {
  HOME_SECTION_IDS,
  HOME_WHY_ICON_IDS,
  homeContentSchema,
  type HomeContent,
  type HomeSectionId,
} from "@/features/website-cms/schemas/home";
import { cn } from "@/lib/utils";
import { VersionsPanel } from "@/pages/editor/VersionsPanel";

type EditorFieldProps = {
  errors: FieldErrors<HomeContent>;
  label: string;
  max?: number;
  min?: number;
  multiline?: boolean;
  name: FieldPath<HomeContent>;
  readOnly?: boolean;
  register: UseFormRegister<HomeContent>;
  step?: number;
  valueAsNumber?: boolean;
};

function fieldId(name: string) {
  return `home-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

function EditorField({
  errors,
  label,
  max,
  min,
  multiline = false,
  name,
  readOnly = false,
  register,
  step,
  valueAsNumber = false,
}: EditorFieldProps) {
  const id = fieldId(name);
  const error = (get(errors, name) as { message?: string } | undefined)?.message;
  const registration = register(
    name,
    valueAsNumber ? { valueAsNumber: true } : undefined,
  );
  const sharedProps = {
    "aria-describedby": error ? `${id}-error` : undefined,
    "aria-invalid": Boolean(error),
    id,
    readOnly,
    ...registration,
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea {...sharedProps} rows={3} />
      ) : (
        <Input
          {...sharedProps}
          className={readOnly ? "bg-slate-50 text-slate-600" : undefined}
          inputMode={valueAsNumber ? "numeric" : undefined}
          max={max}
          min={min}
          step={step}
          type={valueAsNumber ? "number" : "text"}
        />
      )}
      {error && (
        <p className="text-xs text-red-700" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

type BilingualFieldsProps = {
  base: string;
  errors: FieldErrors<HomeContent>;
  label: string;
  multiline?: boolean;
  register: UseFormRegister<HomeContent>;
};

function BilingualFields({
  base,
  errors,
  label,
  multiline = false,
  register,
}: BilingualFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EditorField
        errors={errors}
        label={`${label} (Malay)`}
        multiline={multiline}
        name={`${base}.ms` as FieldPath<HomeContent>}
        register={register}
      />
      <EditorField
        errors={errors}
        label={`${label} (English)`}
        multiline={multiline}
        name={`${base}.en` as FieldPath<HomeContent>}
        register={register}
      />
    </div>
  );
}

type SelectFieldProps = {
  errors: FieldErrors<HomeContent>;
  label: string;
  name: FieldPath<HomeContent>;
  options: readonly string[];
  register: UseFormRegister<HomeContent>;
};

function SelectField({ errors, label, name, options, register }: SelectFieldProps) {
  const id = fieldId(name);
  const error = (get(errors, name) as { message?: string } | undefined)?.message;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        id={id}
        {...register(name)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("-", " ")}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-700" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function EditorSection({
  children,
  description,
  initiallyOpen = false,
  title,
}: {
  children: ReactNode;
  description: string;
  initiallyOpen?: boolean;
  title: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="cursor-pointer list-none px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
        <span className="font-semibold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>
      </summary>
      <div className="space-y-5 border-t border-slate-200 p-5">{children}</div>
    </details>
  );
}

function SectionCopyFields({
  base,
  errors,
  label,
  register,
}: {
  base: string;
  errors: FieldErrors<HomeContent>;
  label: string;
  register: UseFormRegister<HomeContent>;
}) {
  return (
    <>
      <BilingualFields base={`${base}.eyebrow`} errors={errors} label={`${label} eyebrow`} register={register} />
      <BilingualFields base={`${base}.title`} errors={errors} label={`${label} title`} register={register} />
      <BilingualFields base={`${base}.description`} errors={errors} label={`${label} description`} multiline register={register} />
    </>
  );
}

const SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: "Hero",
  why: "Why",
  video: "Video",
  services: "Services",
  gallery: "Gallery",
  testimonials: "Testimonials",
  map: "Map",
};

type EditorMutation =
  | "loading"
  | "publishing"
  | "reloading"
  | "restoring"
  | "saving";

export function HomeEditor() {
  const { language, setLanguage } = useLanguage();
  const form = useForm<HomeContent>({
    defaultValues: structuredClone(DEFAULT_HOME_CONTENT),
    mode: "onBlur",
    resolver: zodResolver(homeContentSchema),
  });
  const { errors, isDirty } = form.formState;
  const [editorPage, setEditorPage] = useState<EditorWebsitePageResult<HomeContent> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<EditorMutation | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);
  const mutationRef = useRef<EditorMutation | null>(null);
  const mutationGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  const slides = useFieldArray({ control: form.control, name: "hero.slides" });
  const heroCtas = useFieldArray({ control: form.control, name: "hero.ctas" });
  const whyItems = useFieldArray({ control: form.control, name: "why.items" });

  useEditorDirtyState(isDirty);

  const beginMutation = useCallback((kind: EditorMutation) => {
    if (!mountedRef.current || mutationRef.current !== null) return null;
    const generation = mutationGenerationRef.current + 1;
    mutationGenerationRef.current = generation;
    mutationRef.current = kind;
    setMutation(kind);
    return generation;
  }, []);

  const isCurrentMutation = useCallback(
    (generation: number) =>
      mountedRef.current && mutationGenerationRef.current === generation,
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
      result: EditorWebsitePageResult<HomeContent>,
      generation: number,
    ) => {
      if (!isCurrentMutation(generation)) return false;
      setEditorPage(result);
      form.reset(result.draft.content);
      setConflict(false);
      return true;
    },
    [form, isCurrentMutation],
  );

  const loadPage = useCallback(
    async () => {
      const generation = beginMutation("loading");
      if (generation === null) return false;
      setLoadError(null);
      try {
        const result = await fetchEditorPage("home");
        return applyLoadedPage(result, generation);
      } catch {
        if (isCurrentMutation(generation)) {
          setLoadError("The Home draft could not be loaded. Check your connection and try again.");
        }
        return false;
      } finally {
        finishMutation(generation);
      }
    },
    [applyLoadedPage, beginMutation, finishMutation, isCurrentMutation],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mutationGenerationRef.current += 1;
      mutationRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const saveDraft = async (content: HomeContent) => {
    if (!editorPage) return;
    const generation = beginMutation("saving");
    if (generation === null) return;
    setNotice(null);
    try {
      const saved = await savePageDraft({
        baseRevision: editorPage.draft.baseRevision,
        content,
        pageId: editorPage.page.id,
        slug: "home",
      });
      if (!isCurrentMutation(generation)) return;
      setEditorPage((current) => (current ? { ...current, draft: saved as typeof current.draft } : current));
      form.reset(saved.content as HomeContent);
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
      await publishPageDraft({
        expectedRevision: editorPage.draft.baseRevision,
        pageId: editorPage.page.id,
      });
      if (!isCurrentMutation(generation)) return;
      setPublishDialogOpen(false);
      const result = await fetchEditorPage("home");
      if (!applyLoadedPage(result, generation)) return;
      setNotice({ message: "Home page published.", tone: "success" });
    } catch (error) {
      if (!isCurrentMutation(generation)) return;
      setPublishDialogOpen(false);
      if (error instanceof StaleWebsitePageDraftError) {
        setConflict(true);
      } else {
        setConflict(false);
        setNotice({
          message:
            "Home page could not be published. The saved draft is unchanged. Try again.",
          tone: "error",
        });
      }
    } finally {
      finishMutation(generation);
    }
  };

  const reloadLatestDraft = async () => {
    const discard = window.confirm(
      "Reload the latest private draft and discard any local form changes?",
    );
    if (!discard) return;
    const generation = beginMutation("reloading");
    if (generation === null) return;
    setNotice(null);
    setLoadError(null);
    try {
      const result = await fetchEditorPage("home");
      applyLoadedPage(result, generation);
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
      await restorePageVersionToDraft({
        pageId: editorPage.page.id,
        versionId,
      });
      if (!isCurrentMutation(generation)) return false;
      const result = await fetchEditorPage("home");
      if (!applyLoadedPage(result, generation)) return false;
      setNotice({
        message: "Version restored to the private draft. Review it before publishing.",
        tone: "success",
      });
      return true;
    } catch {
      return false;
    } finally {
      finishMutation(generation);
    }
  };

  if (!editorPage && !loadError) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-600" role="status">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-blue-600" />
        Loading Home editor
      </div>
    );
  }

  if (!editorPage || loadError) {
    return (
      <section aria-labelledby="home-editor-load-error" className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="font-semibold text-red-950" id="home-editor-load-error">
          Home editor unavailable
        </h1>
        <p className="mt-2 text-sm text-red-800">{loadError}</p>
        <Button className="mt-4" disabled={mutation !== null} onClick={() => void loadPage()} type="button" variant="outline">
          Retry
        </Button>
      </section>
    );
  }

  const currentContent = form.watch();
  const previewContent = projectHomePreview(currentContent);
  const sectionOrder = form.watch("sectionOrder");
  const isBusy = mutation !== null;
  const isSaving = mutation === "saving";
  const isPublishing = mutation === "publishing";
  const publishDisabled =
    isDirty || !editorPage.draft.persisted || isBusy;

  const toggleSection = (section: HomeSectionId, visible: boolean) => {
    const nextOrder = visible
      ? [...sectionOrder, section]
      : sectionOrder.filter((item) => item !== section);
    if (nextOrder.length === 0) return;
    form.setValue("sectionOrder", nextOrder, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const moveSection = (section: HomeSectionId, direction: -1 | 1) => {
    const index = sectionOrder.indexOf(section);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= sectionOrder.length) return;
    const nextOrder = [...sectionOrder];
    [nextOrder[index], nextOrder[destination]] = [
      nextOrder[destination],
      nextOrder[index],
    ];
    form.setValue("sectionOrder", nextOrder, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <section aria-labelledby="home-editor-title" className="space-y-6">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Website content</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900" id="home-editor-title">
            Home page
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Edit approved copy and presentation settings. Changes stay local until Save Draft and do not affect the public page until Publish.
          </p>
        </div>
        <a
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          href="/"
          target="_blank"
          rel="noopener noreferrer"
        >
          View public Home
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </header>

      {notice && (
        <div
          className={cn(
            "rounded-lg border p-4 text-sm",
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900",
          )}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      )}

      {conflict && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p className="font-semibold">The live page changed before this draft could publish.</p>
          <p className="mt-1 leading-6">
            Reload the latest draft, then merge your local edits before publishing again. Copy any local text you need before reloading.
          </p>
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
            <p className="mt-1 text-xs text-slate-500">
              Published revision {editorPage.page.revision} · Draft based on revision {editorPage.draft.baseRevision}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!isDirty || isBusy} type="submit" variant="outline">
              {isSaving ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
            <Button
              disabled={publishDisabled}
              onClick={() => setPublishDialogOpen(true)}
              title={isDirty ? "Save local changes before publishing" : undefined}
              type="button"
            >
              <Send aria-hidden="true" className="mr-2 h-4 w-4" />
              Publish
            </Button>
          </div>
        </div>

        <fieldset
          aria-label="Home page editable fields"
          className="contents"
          disabled={isBusy}
        >
        <EditorSection description="Background, carousel timing, slides, calls to action, and accessible carousel labels." initiallyOpen title="Hero">
          <EditorField errors={errors} label="Hero background image URL" name="hero.backgroundImage" register={form.register} />
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <Button disabled size="sm" type="button" variant="outline">Media upload available in the resources phase</Button>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              The current URL remains unchanged unless you edit it directly. A later media uploader will replace it only after a successful upload.
            </p>
          </div>
          <BilingualFields base="hero.backgroundAlt" errors={errors} label="Hero background alt text" register={form.register} />
          <div className="grid gap-4 md:grid-cols-2">
            <EditorField errors={errors} label="Hero background opacity" max={25} min={5} name="hero.backgroundOpacity" register={form.register} step={1} valueAsNumber />
            <EditorField errors={errors} label="Hero autoplay interval" max={15000} min={3000} name="hero.autoplayMs" register={form.register} step={500} valueAsNumber />
          </div>

          <fieldset className="space-y-4">
            <legend className="font-medium text-slate-900">Hero slides</legend>
            {slides.fields.map((slide, index) => (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4" key={slide.id}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Slide {index + 1}</h3>
                  <Button aria-label={`Remove hero slide ${index + 1}`} disabled={slides.fields.length === 1} onClick={() => slides.remove(index)} size="sm" type="button" variant="ghost">
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <BilingualFields base={`hero.slides.${index}.title`} errors={errors} label={`Hero slide ${index + 1} title`} register={form.register} />
                <BilingualFields base={`hero.slides.${index}.subtitle`} errors={errors} label={`Hero slide ${index + 1} subtitle`} multiline register={form.register} />
              </div>
            ))}
            <Button disabled={slides.fields.length >= 12} onClick={() => slides.append({ title: { ms: "", en: "" }, subtitle: { ms: "", en: "" } })} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />Add slide
            </Button>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-medium text-slate-900">Hero calls to action</legend>
            {heroCtas.fields.map((cta, index) => (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4" key={cta.id}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">CTA {index + 1}</h3>
                  <Button aria-label={`Remove hero CTA ${index + 1}`} disabled={heroCtas.fields.length === 1} onClick={() => heroCtas.remove(index)} size="sm" type="button" variant="ghost">
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <BilingualFields base={`hero.ctas.${index}.label`} errors={errors} label={`Hero CTA ${index + 1} label`} register={form.register} />
                <EditorField errors={errors} label={`Hero CTA ${index + 1} URL`} name={`hero.ctas.${index}.href` as FieldPath<HomeContent>} register={form.register} />
              </div>
            ))}
            <Button disabled={heroCtas.fields.length >= 12} onClick={() => heroCtas.append({ label: { ms: "", en: "" }, href: "/" })} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />Add CTA
            </Button>
          </fieldset>
          <BilingualFields base="hero.carouselLabels.previous" errors={errors} label="Hero carousel previous label" register={form.register} />
          <BilingualFields base="hero.carouselLabels.next" errors={errors} label="Hero carousel next label" register={form.register} />
          <BilingualFields base="hero.carouselLabels.goTo" errors={errors} label="Hero carousel go to label" register={form.register} />
        </EditorSection>

        <EditorSection description="Introductory copy and structured highlight cards." title="Why Klinik Awfa">
          <SectionCopyFields base="why" errors={errors} label="Why" register={form.register} />
          <fieldset className="space-y-4">
            <legend className="font-medium text-slate-900">Why highlights</legend>
            {whyItems.fields.map((item, index) => (
              <div className="space-y-4 rounded-lg border border-slate-200 p-4" key={item.id}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Highlight {index + 1}</h3>
                  <Button aria-label={`Remove Why item ${index + 1}`} disabled={whyItems.fields.length === 1} onClick={() => whyItems.remove(index)} size="sm" type="button" variant="ghost">
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <SelectField errors={errors} label={`Why item ${index + 1} icon`} name={`why.items.${index}.icon` as FieldPath<HomeContent>} options={HOME_WHY_ICON_IDS} register={form.register} />
                <BilingualFields base={`why.items.${index}.title`} errors={errors} label={`Why item ${index + 1} title`} register={form.register} />
                <BilingualFields base={`why.items.${index}.description`} errors={errors} label={`Why item ${index + 1} description`} multiline register={form.register} />
              </div>
            ))}
            <Button disabled={whyItems.fields.length >= 12} onClick={() => whyItems.append({ icon: "clock", title: { ms: "", en: "" }, description: { ms: "", en: "" } })} size="sm" type="button" variant="outline">
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />Add highlight
            </Button>
          </fieldset>
        </EditorSection>

        <EditorSection description="Clinic video copy and the approved setting keys used by the public renderer." title="Clinic video">
          <SectionCopyFields base="video" errors={errors} label="Video" register={form.register} />
          <BilingualFields base="video.placeholder" errors={errors} label="Video placeholder" register={form.register} />
          <BilingualFields base="video.unsupportedMessage" errors={errors} label="Video unsupported message" register={form.register} />
          <div className="grid gap-4 md:grid-cols-2">
            <EditorField errors={errors} label="Video URL setting key" name="video.videoUrlSettingKey" readOnly register={form.register} />
            <EditorField errors={errors} label="Video poster setting key" name="video.posterSettingKey" readOnly register={form.register} />
          </div>
        </EditorSection>

        <EditorSection description="Section copy, destination, displayed item count, and card action label." title="Services preview">
          <SectionCopyFields base="services" errors={errors} label="Services" register={form.register} />
          <BilingualFields base="services.cta.label" errors={errors} label="Services CTA label" register={form.register} />
          <EditorField errors={errors} label="Services CTA URL" name="services.cta.href" register={form.register} />
          <EditorField errors={errors} label="Services item limit" max={12} min={1} name="services.itemLimit" register={form.register} valueAsNumber />
          <BilingualFields base="services.learnMoreLabel" errors={errors} label="Services learn more label" register={form.register} />
        </EditorSection>

        <EditorSection description="Section copy, gallery limit, destination, empty state, and accessible carousel labels." title="Gallery strip">
          <SectionCopyFields base="gallery" errors={errors} label="Gallery" register={form.register} />
          <BilingualFields base="gallery.cta.label" errors={errors} label="Gallery CTA label" register={form.register} />
          <EditorField errors={errors} label="Gallery CTA URL" name="gallery.cta.href" register={form.register} />
          <EditorField errors={errors} label="Gallery item limit" max={12} min={1} name="gallery.itemLimit" register={form.register} valueAsNumber />
          <BilingualFields base="gallery.emptyMessage" errors={errors} label="Gallery empty message" register={form.register} />
          <BilingualFields base="gallery.moreLabel" errors={errors} label="Gallery more label" register={form.register} />
          <BilingualFields base="gallery.carouselLabels.previous" errors={errors} label="Gallery carousel previous label" register={form.register} />
          <BilingualFields base="gallery.carouselLabels.next" errors={errors} label="Gallery carousel next label" register={form.register} />
          <BilingualFields base="gallery.carouselLabels.goTo" errors={errors} label="Gallery carousel go to label" register={form.register} />
          <BilingualFields base="gallery.closeLabel" errors={errors} label="Gallery close label" register={form.register} />
          <BilingualFields base="gallery.previousLabel" errors={errors} label="Gallery previous label" register={form.register} />
          <BilingualFields base="gallery.nextLabel" errors={errors} label="Gallery next label" register={form.register} />
          <BilingualFields base="gallery.swipeHint" errors={errors} label="Gallery swipe hint" register={form.register} />
        </EditorSection>

        <EditorSection description="Section copy and labels used by the public testimonials carousel." title="Testimonials">
          <SectionCopyFields base="testimonials" errors={errors} label="Testimonials" register={form.register} />
          <BilingualFields base="testimonials.patientLabel" errors={errors} label="Testimonials patient label" register={form.register} />
          <BilingualFields base="testimonials.goToSlideLabel" errors={errors} label="Testimonials go to slide label" register={form.register} />
          <BilingualFields base="testimonials.previousSlideLabel" errors={errors} label="Testimonials previous slide label" register={form.register} />
          <BilingualFields base="testimonials.nextSlideLabel" errors={errors} label="Testimonials next slide label" register={form.register} />
          <BilingualFields base="testimonials.carouselRoleDescription" errors={errors} label="Testimonials carousel role description" register={form.register} />
          <BilingualFields base="testimonials.slideRoleDescription" errors={errors} label="Testimonials slide role description" register={form.register} />
        </EditorSection>

        <EditorSection description="Location copy, directions destination, and the safe map embed fields." title="Map and location">
          <SectionCopyFields base="map" errors={errors} label="Map" register={form.register} />
          <BilingualFields base="map.hoursLabel" errors={errors} label="Map hours label" register={form.register} />
          <BilingualFields base="map.everydayLabel" errors={errors} label="Map everyday label" register={form.register} />
          <BilingualFields base="map.callLabel" errors={errors} label="Map call label" register={form.register} />
          <BilingualFields base="map.directionsCta.label" errors={errors} label="Map directions label" register={form.register} />
          <EditorField errors={errors} label="Map directions URL" name="map.directionsCta.href" register={form.register} />
          <EditorField errors={errors} label="Map embed URL" name="map.embedUrl" register={form.register} />
          <BilingualFields base="map.embedTitle" errors={errors} label="Map embed title" register={form.register} />
        </EditorSection>

        <EditorSection description="Search title and description for both supported languages." title="Search appearance">
          <BilingualFields base="seo.title" errors={errors} label="SEO title" register={form.register} />
          <BilingualFields base="seo.description" errors={errors} label="SEO description" multiline register={form.register} />
        </EditorSection>

        <EditorSection description="Choose visible sections and arrange the order used by both preview and public rendering." title="Section visibility and order">
          <ol className="space-y-2">
            {HOME_SECTION_IDS.map((section) => {
              const visible = sectionOrder.includes(section);
              const position = sectionOrder.indexOf(section);
              return (
                <li className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3" key={section}>
                  <label className="flex min-w-36 flex-1 items-center gap-3 text-sm font-medium text-slate-800">
                    <input
                      checked={visible}
                      disabled={visible && sectionOrder.length === 1}
                      onChange={(event) => toggleSection(section, event.target.checked)}
                      type="checkbox"
                    />
                    Show {SECTION_LABELS[section]}
                  </label>
                  <Button aria-label={`Move ${SECTION_LABELS[section]} up`} disabled={!visible || position === 0} onClick={() => moveSection(section, -1)} size="sm" type="button" variant="outline">
                    <ArrowUp aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button aria-label={`Move ${SECTION_LABELS[section]} down`} disabled={!visible || position === sectionOrder.length - 1} onClick={() => moveSection(section, 1)} size="sm" type="button" variant="outline">
                    <ArrowDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        </EditorSection>
        </fieldset>

        <VersionsPanel
          disabled={isBusy}
          isRestoring={mutation === "restoring"}
          onRestore={restoreVersion}
          pageId={editorPage.page.id}
        />
      </form>

      <section aria-labelledby="live-preview-title" className="mt-12 border-t border-slate-200 pt-10">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-2 text-sm font-medium text-slate-700">Preview language</span>
          <Button aria-label="Preview in Malay" aria-pressed={language === "ms"} onClick={() => setLanguage("ms")} size="sm" type="button" variant={language === "ms" ? "default" : "outline"}>Malay</Button>
          <Button aria-label="Preview in English" aria-pressed={language === "en"} onClick={() => setLanguage("en")} size="sm" type="button" variant={language === "en" ? "default" : "outline"}>English</Button>
        </div>
        <LivePreview title={language === "ms" ? "Pratonton Langsung" : "Live Preview"}>
          <HomeRenderer content={previewContent} preview />
        </LivePreview>
      </section>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Home page?</AlertDialogTitle>
            <AlertDialogDescription>
              This atomically replaces the live Home content with the saved private draft and records the previous published revision. Unsaved local changes are never included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPublishing}
              onClick={(event) => {
                event.preventDefault();
                void publishDraft();
              }}
            >
              {isPublishing && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              Publish now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
