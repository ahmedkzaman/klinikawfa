import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPostTag, listPostTaxonomy, type PostTaxonomyOption } from "@/features/website-cms/posts/api";

export function PostTaxonomyFields({ categoryId, onCategoryChange, onTagsChange, tagIds }: {
  categoryId: string | null;
  onCategoryChange(value: string | null): void;
  onTagsChange(value: string[]): void;
  tagIds: string[];
}) {
  const [categories, setCategories] = useState<PostTaxonomyOption[]>([]);
  const [tags, setTags] = useState<PostTaxonomyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    void listPostTaxonomy().then((result) => {
      if (active) { setCategories(result.categories); setTags(result.tags); }
    }).catch(() => { if (active) setError("Categories and tags could not be loaded."); });
    return () => { active = false; };
  }, []);
  const toggleTag = (id: string, checked: boolean) => onTagsChange(
    checked ? [...new Set([...tagIds, id])] : tagIds.filter((tagId) => tagId !== id),
  );
  const addTag = async () => {
    setCreating(true);
    setError(null);
    try {
      const tag = await createPostTag(newTag);
      setTags((current) => current.some((item) => item.id === tag.id) ? current : [...current, tag]);
      onTagsChange([...new Set([...tagIds, tag.id])]);
      setNewTag("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tag could not be created.");
    } finally { setCreating(false); }
  };
  return (
    <fieldset aria-label="Tags" className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
      <legend className="px-1 text-sm font-semibold text-slate-900">Categories and tags</legend>
      <div className="space-y-2"><Label htmlFor="post-category">Category</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" id="post-category" onChange={(event) => onCategoryChange(event.target.value || null)} value={categoryId ?? ""}><option value="">Uncategorised</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      <div><p className="text-sm font-medium">Tags</p>{tags.length ? <div className="mt-2 flex flex-wrap gap-3">{tags.map((tag) => <label className="flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-sm" key={tag.id}><input checked={tagIds.includes(tag.id)} onChange={(event) => toggleTag(tag.id, event.target.checked)} type="checkbox" />{tag.name}</label>)}</div> : <p className="mt-2 text-sm text-slate-500">No tags have been created yet.</p>}<div className="mt-3 flex gap-2"><Input aria-label="New tag name" maxLength={100} onChange={(event) => setNewTag(event.target.value)} placeholder="Add a new tag" value={newTag} /><Button disabled={creating || !newTag.trim()} onClick={() => void addTag()} type="button" variant="outline">Add tag</Button></div></div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </fieldset>
  );
}
