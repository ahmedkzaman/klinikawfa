import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { listServiceResources, type ServiceResourceSummary } from "@/features/website-cms/api/resources";
import { CANONICAL_SERVICE_SEO_TARGETS } from "@/features/website-cms/service-seo/domain";
import { fetchServiceSeoForEditor, generateAndSaveServiceSeoDraft } from "@/features/website-cms/service-seo/api";
import { deleteLandingPage, saveLandingPage } from "@/features/website-cms/services/landingPageApi";
import { DEFAULT_LANDING_PAGE_VALUES, isProtectedServiceSlug, landingPageFormSchema, type LandingPageFormValues } from "@/features/website-cms/services/landingPageDomain";
import { resolveCanonicalServiceSlug } from "@/lib/serviceSlugMap";

export function ServicesEditorList() {
  const [items, setItems] = useState<ServiceResourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceResourceSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<LandingPageFormValues>(DEFAULT_LANDING_PAGE_VALUES);

  const loadServices = () => {
    let active = true;
    setLoading(true);
    setError(false);
    const request = listServiceResources()
      .then((rows) => { if (active) setItems(rows); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return { cancel: () => { active = false; }, request };
  };

  useEffect(() => {
    const load = loadServices();
    return load.cancel;
  }, []);

  const updateForm = (key: keyof LandingPageFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = async () => {
    const parsed = landingPageFormSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please check the page details.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const result = await saveLandingPage(parsed.data);
      toast.success("Service page created");
      setCreateOpen(false);
      setForm(DEFAULT_LANDING_PAGE_VALUES);
      await loadServices().request;
      if (result.created) {
        try {
          const record = await fetchServiceSeoForEditor(result.seoId);
          await generateAndSaveServiceSeoDraft({ resourceId: result.seoId, record });
          toast.success("SEO and AEO draft generated for review");
        } catch {
          toast.warning("Page created. SEO and AEO generation can be retried from Edit SEO.");
        }
      }
    } catch (cause) {
      const failure = cause as { code?: string; message?: string };
      setFormError(failure.code === "23505" ? "A service page with this URL slug already exists." : failure.message ?? "Service page could not be created.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isProtectedServiceSlug(deleteTarget.slug)) return;
    setDeleting(true);
    try {
      await deleteLandingPage(deleteTarget.id);
      toast.success("Service page deleted");
      setDeleteTarget(null);
      await loadServices().request;
    } catch (cause) {
      toast.error((cause as { message?: string }).message ?? "Service page could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const contentByPath = useMemo(() => new Map(items.map((item) => [
    `/services/${resolveCanonicalServiceSlug(item.slug)}/`,
    item,
  ])), [items]);
  const canonicalContentIds = useMemo(() => new Set(
    CANONICAL_SERVICE_SEO_TARGETS
      .map((target) => contentByPath.get(target.path)?.id)
      .filter((id): id is string => Boolean(id)),
  ), [contentByPath]);
  const landingPages = useMemo(
    () => items.filter((item) => !canonicalContentIds.has(item.id)),
    [canonicalContentIds, items],
  );

  return (
    <section className="space-y-6" aria-labelledby="services-editor-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">Public content</p>
          <h1 className="mt-1 text-2xl font-semibold" id="services-editor-title">Services</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Manage content for every service landing page and bilingual search and social metadata for canonical service pages. Category aliases continue to inherit their canonical page.</p>
        </div>
        <Button onClick={() => { setForm(DEFAULT_LANDING_PAGE_VALUES); setFormError(""); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />Create service page
        </Button>
      </header>
      {loading && <p className="flex items-center gap-2 rounded-xl border bg-white p-5 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading services</p>}
      {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">Content links could not be loaded. SEO editing remains available.</p>}
      {!loading && (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {CANONICAL_SERVICE_SEO_TARGETS.map((target) => {
            const content = contentByPath.get(target.path);
            return (
              <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={target.id}>
                <div>
                  <h2 className="font-semibold text-slate-900">{target.labelMs}</h2>
                  <p className="mt-1 text-sm text-slate-600">{target.labelEn}</p>
                  <p className="mt-1 text-xs text-slate-500">{target.path}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {content && <Button asChild size="sm" variant="outline"><Link to={`/editor/services/${content.id}`}><Pencil className="mr-2 h-4 w-4" />Edit content</Link></Button>}
                  <Button asChild size="sm"><Link to={`/editor/services/seo/${target.id}`}><Search className="mr-2 h-4 w-4" />Edit SEO</Link></Button>
                  {content && !isProtectedServiceSlug(content.slug) && (
                    <Button aria-label={`Delete ${content.title}`} onClick={() => setDeleteTarget(content)} size="sm" variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {landingPages.map((item) => {
            const path = `/services/${resolveCanonicalServiceSlug(item.slug)}/`;
            return (
              <li className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
                <div>
                  <h2 className="font-semibold text-slate-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">Landing page</p>
                  <p className="mt-1 text-xs text-slate-500">{path}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link aria-label={`Edit content: ${item.title}`} to={`/editor/services/${item.id}`}>
                      <Pencil className="mr-2 h-4 w-4" />Edit content
                    </Link>
                  </Button>
                  {item.seoId && <Button asChild size="sm"><Link aria-label={`Edit SEO: ${item.title}`} to={`/editor/services/seo/${item.seoId}`}><Search className="mr-2 h-4 w-4" />Edit SEO</Link></Button>}
                  {!isProtectedServiceSlug(item.slug) && (
                    <Button aria-label={`Delete ${item.title}`} onClick={() => setDeleteTarget(item)} size="sm" variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />Delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Create service page</DialogTitle><DialogDescription>Create a public landing page. Its URL slug cannot be changed later.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="service-title">Title</Label><Input id="service-title" value={form.title} onChange={(event) => updateForm("title", event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="service-slug">URL slug</Label><Input id="service-slug" placeholder="rawatan-ke-rumah" value={form.slug} onChange={(event) => updateForm("slug", event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="service-description">Page content</Label><Textarea id="service-description" className="min-h-40" value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="service-list">Services included (one per line)</Label><Textarea id="service-list" value={form.services_list.map(({ value }) => value).join("\n")} onChange={(event) => setForm((current) => ({ ...current, services_list: event.target.value.split("\n").map((value) => ({ value })) }))} /></div>
            <div className="grid gap-2"><Label htmlFor="service-cta">Call to action</Label><Input id="service-cta" value={form.call_to_action} onChange={(event) => updateForm("call_to_action", event.target.value)} /></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="service-image">Hero image URL (optional)</Label><Input id="service-image" value={form.hero_image_url} onChange={(event) => updateForm("hero_image_url", event.target.value)} /></div>
              <div className="grid gap-2"><Label htmlFor="service-video">Promo video URL (optional)</Label><Input id="service-video" value={form.promo_video_url} onChange={(event) => updateForm("promo_video_url", event.target.value)} /></div>
            </div>
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={saving} onClick={() => void handleCreate()}>{saving ? "Creating..." : "Create page"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete service page?</AlertDialogTitle><AlertDialogDescription>This permanently deletes “{deleteTarget?.title}”. Its public URL will stop working immediately. Uploaded media is retained.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={() => void handleDelete()}>{deleting ? "Deleting..." : "Delete page"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
