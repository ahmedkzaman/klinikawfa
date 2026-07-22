import { supabase } from "@/integrations/supabase/client";

export interface PostTaxonomyOption { id: string; name: string; }

export async function listPostTaxonomy(): Promise<{ categories: PostTaxonomyOption[]; tags: PostTaxonomyOption[] }> {
  const [categoriesResult, tagsResult] = await Promise.all([
    supabase.from("blog_categories").select("id,name,name_ms").order("name"),
    supabase.from("blog_tags").select("id,name_ms").order("name_ms"),
  ]);
  if (categoriesResult.error || tagsResult.error) throw new Error("Post categories and tags could not be loaded");
  return {
    categories: (categoriesResult.data ?? []).map((row) => ({ id: row.id, name: row.name_ms || row.name })),
    tags: (tagsResult.data ?? []).map((row) => ({ id: row.id, name: row.name_ms })),
  };
}

export async function createPostTag(name: string): Promise<PostTaxonomyOption> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100) throw new Error("Enter a tag name up to 100 characters");
  const slug = normalizedName.toLocaleLowerCase("en-MY").normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Use letters or numbers in the tag name");
  const { data: existing } = await supabase.from("blog_tags").select("id,name_ms").eq("slug", slug).maybeSingle();
  if (existing) return { id: existing.id, name: existing.name_ms };
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Sign in again before adding a tag");
  const { data, error } = await supabase.from("blog_tags").insert({
    created_by: userResult.user.id,
    name_ms: normalizedName,
    slug,
  }).select("id,name_ms").single();
  if (error || !data) throw new Error("Tag could not be created");
  return { id: data.id, name: data.name_ms };
}
