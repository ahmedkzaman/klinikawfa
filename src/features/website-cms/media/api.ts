import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

import { createWebsiteMediaPath, validateWebsiteMedia, type WebsiteMediaFolder } from "./validation";

export interface WebsiteMedia {
  id: string;
  storageBucket: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  altMs: string;
  altEn: string;
  captionMs: string;
  captionEn: string;
  descriptionMs: string;
  descriptionEn: string;
  createdAt: string;
  createdBy: string;
  trashedAt: string | null;
  replacedBy: string | null;
  referenceCount: number;
}

export interface MediaQuery {
  search?: string;
  status?: "active" | "trash";
  mimeGroup?: "all" | "image" | "video";
  limit?: number;
  offset?: number;
}

export async function listMedia(query: MediaQuery = {}): Promise<{ items: WebsiteMedia[]; total: number }> {
  let request = supabase.from("website_media").select("*", { count: "exact" });
  request = query.status === "trash" ? request.not("trashed_at", "is", null) : request.is("trashed_at", null);
  if (query.mimeGroup && query.mimeGroup !== "all") request = request.like("mime_type", `${query.mimeGroup}/%`);
  if (query.search?.trim()) {
    const needle = query.search.trim().replace(/[%_,()]/g, "");
    request = request.or(`alt_ms.ilike.%${needle}%,alt_en.ilike.%${needle}%,caption_ms.ilike.%${needle}%,caption_en.ilike.%${needle}%,storage_path.ilike.%${needle}%`);
  }
  const { data, error, count } = await request.order("created_at", { ascending: false }).range(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50) - 1);
  if (error) throw new Error("Media Library could not be loaded");
  const references = await loadReferenceCounts((data ?? []).map((row) => row.id));
  return { items: (data ?? []).map((row) => mapMedia(row, references.get(row.id) ?? 0)), total: count ?? 0 };
}

export async function getMedia(id: string): Promise<WebsiteMedia> {
  const { data, error } = await supabase.from("website_media").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Media item not found");
  const references = await loadReferenceCounts([id]);
  return mapMedia(data, references.get(id) ?? 0);
}

export async function updateMediaMetadata(id: string, input: Pick<WebsiteMedia, "altMs" | "altEn" | "captionMs" | "captionEn" | "descriptionMs" | "descriptionEn">) {
  const { error } = await supabase.from("website_media").update({ alt_ms: input.altMs, alt_en: input.altEn, caption_ms: input.captionMs, caption_en: input.captionEn, description_ms: input.descriptionMs, description_en: input.descriptionEn }).eq("id", id);
  if (error) throw new Error("Media details could not be saved");
}

export async function uploadAndCreateMedia(file: File, folder: WebsiteMediaFolder): Promise<WebsiteMedia> {
  const { extension, mime } = validateWebsiteMedia(file);
  const storagePath = createWebsiteMediaPath(folder, extension);
  const dimensions = mime.startsWith("image/") ? await readImageDimensions(file) : { width: null, height: null };
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Sign in again before uploading media");
  const { data, error } = await supabase.from("website_media").insert({ storage_bucket: "website-media", storage_path: storagePath, mime_type: mime, byte_size: file.size, width: dimensions.width, height: dimensions.height, created_by: userResult.user.id, alt_ms: file.name.replace(/\.[^.]+$/, "") }).select("*").single();
  if (error || !data) throw new Error("Media metadata could not be created");
  const { error: uploadError } = await supabase.storage.from("website-media").upload(storagePath, file, { contentType: mime, upsert: false });
  if (uploadError) {
    const cleanup = await supabase.rpc(
      "discard_unstored_website_media",
      { p_media_id: data.id } as never,
    );
    if (cleanup.error) {
      throw new Error(
        "Media upload failed, and automatic cleanup could not be completed. Refresh the library and contact an administrator.",
      );
    }
    throw new Error("Media upload failed. Nothing was added to the library.");
  }
  return mapMedia(data, 0);
}

export async function replaceMedia(id: string, file: File, folder: WebsiteMediaFolder): Promise<WebsiteMedia> {
  const replacement = await uploadAndCreateMedia(file, folder);
  const { error } = await supabase.from("website_media").update({ replaced_by: replacement.id }).eq("id", id);
  if (error) throw new Error("Replacement was uploaded but could not be linked");
  return replacement;
}

export async function trashMedia(id: string) {
  const { error } = await supabase.from("website_media").update({ trashed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Media could not be moved to Trash");
}

export async function restoreMedia(id: string) {
  const { error } = await supabase.from("website_media").update({ trashed_at: null }).eq("id", id);
  if (error) throw new Error("Media could not be restored");
}

export async function deleteMediaPermanently(id: string) {
  const prepared = await supabase.rpc(
    "permanently_delete_website_media",
    { p_media_id: id } as never,
  );
  if (prepared.error) throw new Error(prepared.error.message);
  const deletion = prepared.data as unknown as {
    storage_bucket: string;
    storage_path: string;
  };
  const { error: storageError } = await supabase.storage
    .from(deletion.storage_bucket)
    .remove([deletion.storage_path]);
  if (storageError) {
    throw new Error("Storage cleanup failed. The media record was kept safely.");
  }
  const finalized = await supabase.rpc(
    "finalize_website_media_deletion",
    { p_media_id: id } as never,
  );
  if (finalized.error) {
    throw new Error("The file was removed, but Media Library cleanup needs attention.");
  }
}

async function loadReferenceCounts(ids: string[]) {
  const result = new Map<string, number>();
  if (!ids.length) return result;
  const { data } = await supabase.from("website_media_references").select("media_id").in("media_id", ids);
  for (const row of data ?? []) result.set(row.media_id, (result.get(row.media_id) ?? 0) + 1);
  return result;
}

type WebsiteMediaRow = Database["public"]["Tables"]["website_media"]["Row"];

function mapMedia(row: WebsiteMediaRow, referenceCount: number): WebsiteMedia {
  const publicUrl = supabase.storage.from(row.storage_bucket).getPublicUrl(row.storage_path).data.publicUrl;
  return { id: row.id, storageBucket: row.storage_bucket, storagePath: row.storage_path, publicUrl, mimeType: row.mime_type, byteSize: Number(row.byte_size), width: row.width, height: row.height, altMs: row.alt_ms, altEn: row.alt_en, captionMs: row.caption_ms, captionEn: row.caption_en, descriptionMs: row.description_ms, descriptionEn: row.description_en, createdAt: row.created_at, createdBy: row.created_by, trashedAt: row.trashed_at, replacedBy: row.replaced_by, referenceCount };
}

async function readImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }); };
    image.src = url;
  });
}
