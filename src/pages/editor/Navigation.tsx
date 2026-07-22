import { History, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { LivePreview } from "@/components/editor/LivePreview";
import { useEditorDirtyState } from "@/components/editor/useEditorDirtyNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchNavigationEditor,
  fetchNavigationVersions,
  publishNavigationDraft,
  restoreNavigationVersion,
  saveNavigationDraft,
} from "@/features/website-cms/api/navigation";
import { navigationDraftSchema, type NavigationDraftItem } from "@/features/website-cms/navigation/schema";

type Notice = { tone: "error" | "success"; text: string };

export function NavigationEditor() {
  const [items, setItems] = useState<NavigationDraftItem[]>([]);
  const [revision, setRevision] = useState(0);
  const [versions, setVersions] = useState<Array<{ id: string; revision: number; publishedAt: string }>>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  useEditorDirtyState(dirty);

  const reload = async () => {
    const value = await fetchNavigationEditor();
    setItems(value.items);
    setRevision(value.revision);
    setDirty(false);
  };

  const reloadVersions = async () => setVersions(await fetchNavigationVersions());

  useEffect(() => {
    void reload().catch(() => setNotice({ tone: "error", text: "Navigation could not be loaded." }));
    void reloadVersions().catch(() => setVersions([]));
  }, []);

  const change = (id: string, key: keyof NavigationDraftItem, value: unknown) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
    setDirty(true);
    setNotice(null);
  };

  const add = () => {
    setItems((current) => [...current, {
      id: crypto.randomUUID(), parentId: null, href: "/", labelMs: "Pautan baharu",
      labelEn: "New link", visible: true, displayOrder: current.filter((item) => !item.parentId).length,
    }]);
    setDirty(true);
  };

  const validate = () => {
    const parsed = navigationDraftSchema.safeParse(items);
    if (!parsed.success) {
      setNotice({ tone: "error", text: parsed.error.issues[0]?.message ?? "Navigation is invalid." });
      return null;
    }
    return parsed.data;
  };

  const save = async () => {
    const value = validate();
    if (!value) return;
    setBusy(true);
    try {
      await saveNavigationDraft(value, revision);
      setDirty(false);
      setNotice({ tone: "success", text: "Navigation draft saved privately." });
    } catch {
      setNotice({ tone: "error", text: "Navigation draft could not be saved." });
    } finally { setBusy(false); }
  };

  const publish = async () => {
    const value = validate();
    if (!value) return;
    setBusy(true);
    try {
      await saveNavigationDraft(value, revision);
      setRevision(await publishNavigationDraft(revision));
      setDirty(false);
      setNotice({ tone: "success", text: "Navigation published successfully." });
      await reloadVersions();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Navigation could not be published." });
    } finally { setBusy(false); }
  };

  const restore = async (versionId: string, versionRevision: number) => {
    if (dirty || busy || !window.confirm(`Restore revision ${versionRevision} to the private draft?`)) return;
    setBusy(true);
    try {
      await restoreNavigationVersion(versionId);
      await reload();
      setNotice({ tone: "success", text: `Revision ${versionRevision} restored to the private draft.` });
    } catch {
      setNotice({ tone: "error", text: "Navigation version could not be restored." });
    } finally { setBusy(false); }
  };

  const roots = items.filter((item) => !item.parentId);
  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm font-medium text-blue-700">Public structure</p><h1 className="mt-1 text-2xl font-semibold">Navigation</h1><p className="mt-2 text-sm text-slate-600">Manage bilingual header and footer links with one submenu level.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />Add link</Button><Button variant="outline" disabled={busy} onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Save draft</Button><Button disabled={busy} onClick={() => void publish()}><Send className="mr-2 h-4 w-4" />Publish</Button></div>
      </header>
      {notice && <p className={`rounded-lg border p-3 text-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
      <div className="space-y-3">
        {items.map((item) => (
          <article className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_1fr_7rem_auto]" key={item.id}>
            <Input aria-label="Malay label" value={item.labelMs} onChange={(event) => change(item.id, "labelMs", event.target.value)} />
            <Input aria-label="English label" value={item.labelEn} onChange={(event) => change(item.id, "labelEn", event.target.value)} />
            <Input aria-label="Link URL" value={item.href} onChange={(event) => change(item.id, "href", event.target.value)} />
            <select aria-label="Parent menu" className="h-10 rounded-md border bg-background px-3 text-sm" value={item.parentId ?? ""} onChange={(event) => change(item.id, "parentId", event.target.value || null)}>
              <option value="">Top-level link</option>
              {roots.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>Under {candidate.labelMs}</option>)}
            </select>
            <Input aria-label="Display order" type="number" value={item.displayOrder} onChange={(event) => change(item.id, "displayOrder", Number(event.target.value))} />
            <div className="flex items-center gap-2"><label className="text-xs"><input checked={item.visible} onChange={(event) => change(item.id, "visible", event.target.checked)} type="checkbox" /> Visible</label><Button aria-label={`Remove ${item.labelMs}`} size="icon" variant="ghost" onClick={() => { setItems((current) => current.filter((candidate) => candidate.id !== item.id && candidate.parentId !== item.id)); setDirty(true); }}><Trash2 className="h-4 w-4" /></Button></div>
          </article>
        ))}
      </div>
      <LivePreview title="Navigation live preview"><header className="border-b bg-white px-6 py-5"><nav className="mx-auto flex max-w-6xl flex-wrap gap-6" aria-label="Preview navigation">{roots.filter((item) => item.visible).sort((a, b) => a.displayOrder - b.displayOrder).map((item) => <span className="font-medium text-slate-800" key={item.id}>{item.labelMs}{items.some((child) => child.visible && child.parentId === item.id) && <span className="ml-2 text-xs text-slate-500">+ submenu</span>}</span>)}</nav></header></LivePreview>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><History className="mt-1 h-5 w-5 text-slate-600" /><div><h2 className="font-semibold">Version history</h2><p className="mt-1 text-sm text-slate-600">Restore an earlier publication to the private draft. The live menu stays unchanged until Publish.</p></div></div>{versions.length === 0 ? <p className="mt-4 text-sm text-slate-600">No published versions yet.</p> : <ol className="mt-4 divide-y rounded-lg border">{versions.map((version) => <li className="flex items-center justify-between gap-4 p-4" key={version.id}><div><p className="text-sm font-medium">Revision {version.revision}</p><p className="text-xs text-slate-500">{new Date(version.publishedAt).toLocaleString("en-MY")}</p></div><Button disabled={dirty || busy} onClick={() => void restore(version.id, version.revision)} size="sm" variant="outline"><RotateCcw className="mr-2 h-4 w-4" />Restore to draft</Button></li>)}</ol>}</section>
    </section>
  );
}
