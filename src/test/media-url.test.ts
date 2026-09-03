import { describe, expect, it } from "vitest";

import { normalizeSupabaseStorageUrl } from "@/lib/media-url";

const CURRENT_REF = "nhjbqdiyptjqherdfbqk";
const LEGACY_REF = "ncysmppzfjtiekfnomdv";

describe("normalizeSupabaseStorageUrl", () => {
  it("rewrites legacy project storage URLs to the current project, preserving path", () => {
    expect(
      normalizeSupabaseStorageUrl(
        `https://${LEGACY_REF}.supabase.co/storage/v1/object/public/gallery/gallery/photo.png`,
        CURRENT_REF,
      ),
    ).toBe(`https://${CURRENT_REF}.supabase.co/storage/v1/object/public/gallery/gallery/photo.png`);
  });

  it("preserves query strings (e.g. render/image transforms)", () => {
    expect(
      normalizeSupabaseStorageUrl(
        `https://${LEGACY_REF}.supabase.co/storage/v1/object/public/videos/clinic/homepage-video.mp4?width=640`,
        CURRENT_REF,
      ),
    ).toBe(
      `https://${CURRENT_REF}.supabase.co/storage/v1/object/public/videos/clinic/homepage-video.mp4?width=640`,
    );
  });

  it("is idempotent for already-current URLs", () => {
    const current = `https://${CURRENT_REF}.supabase.co/storage/v1/object/public/gallery/a.jpg`;
    expect(normalizeSupabaseStorageUrl(current, CURRENT_REF)).toBe(current);
  });

  it("passes through non-storage Supabase URLs untouched", () => {
    const restUrl = `https://${LEGACY_REF}.supabase.co/rest/v1/gallery_images?select=*`;
    expect(normalizeSupabaseStorageUrl(restUrl, CURRENT_REF)).toBe(restUrl);
  });

  it("passes through non-Supabase URLs and relative paths untouched", () => {
    expect(normalizeSupabaseStorageUrl("https://example.com/a.png", CURRENT_REF)).toBe(
      "https://example.com/a.png",
    );
    expect(normalizeSupabaseStorageUrl("/images/local.png", CURRENT_REF)).toBe("/images/local.png");
  });

  it("passes through URLs from unrelated Supabase projects (not legacy, not current)", () => {
    const other = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/x.png";
    expect(normalizeSupabaseStorageUrl(other, CURRENT_REF)).toBe(other);
  });

  it("without a current ref, legacy URLs pass through unchanged (safe default)", () => {
    const legacy = `https://${LEGACY_REF}.supabase.co/storage/v1/object/public/gallery/a.jpg`;
    expect(normalizeSupabaseStorageUrl(legacy, null)).toBe(legacy);
  });

  it("maps null/undefined/blank to empty string", () => {
    expect(normalizeSupabaseStorageUrl(null, CURRENT_REF)).toBe("");
    expect(normalizeSupabaseStorageUrl(undefined, CURRENT_REF)).toBe("");
    expect(normalizeSupabaseStorageUrl("   ", CURRENT_REF)).toBe("");
  });

  it("normalizes case-insensitively and emits a lowercase host", () => {
    const upper = `https://${LEGACY_REF.toUpperCase()}.SUPABASE.CO/storage/v1/object/public/g.png`;
    const out = normalizeSupabaseStorageUrl(upper, CURRENT_REF);
    expect(out).toBe(`https://${CURRENT_REF}.supabase.co/storage/v1/object/public/g.png`);
  });
});
