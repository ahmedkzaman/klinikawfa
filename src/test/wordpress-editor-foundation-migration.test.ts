import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260723090000_add_wordpress_editor_foundation.sql";

describe("WordPress editor foundation migration", () => {
  it("adds lifecycle, media, audit, and guarded mutation contracts", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create type public.website_content_status");
    expect(sql).toContain("create table public.website_media");
    expect(sql).toContain("create table public.website_media_references");
    expect(sql).toContain("create table public.blog_tags");
    expect(sql).toContain("create table public.blog_post_tags");
    expect(sql).toContain("create trigger sync_blog_post_tags_after_publish");
    expect(sql).toContain("create trigger sync_blog_post_metadata_after_publish");
    expect(sql).toContain("website_editor_metadata jsonb");
    expect(sql).toContain("create trigger sync_blog_post_lifecycle_after_publish");
    expect(sql).toContain("create trigger sync_page_lifecycle_after_publish");
    expect(sql).toContain("create trigger prevent_trashed_blog_post_publish");
    expect(sql).toContain("create trigger sync_website_content_media_references");
    expect(sql).toContain("create trigger sync_website_page_media_references");
    expect(sql).toContain("saved draft is required before scheduling");
    expect(sql).toContain("create or replace function private.website_page_payload_is_valid");
    expect(sql).toContain("p_payload - 'sections'");
    expect(sql).not.toContain("private.assert_can_manage_website()");
    expect(sql).toContain("update public.blog_posts set published = false");
    expect(sql).toContain("update public.website_pages set status = 'draft'");
    expect(sql).toMatch(/v_next_revision\s*:=\s*v_state\.revision;/i);
    expect(sql).not.toMatch(/v_next_revision\s*:=\s*v_state\.revision\s*\+\s*1;/i);
    expect(sql).toContain("create table public.website_content_audit");
    expect(sql).toContain("private.can_manage_website()");
    expect(sql).toContain(
      "create or replace function public.trash_website_content",
    );
    expect(sql).toContain(
      "create or replace function public.restore_website_content",
    );
    expect(sql).toContain(
      "create or replace function public.permanently_delete_website_content",
    );
    expect(sql).toContain(
      "create or replace function public.schedule_website_content",
    );
    expect(sql).toContain(
      "create or replace function public.publish_due_website_content",
    );
    expect(sql).toContain(
      "create or replace function public.finalize_website_media_deletion",
    );
    expect(sql).toContain(
      "create or replace function public.discard_unstored_website_media",
    );
    expect(sql).toContain("create trigger prevent_website_media_restore_during_deletion");
    expect(sql).toMatch(/if v_media\.trashed_at is null then\s+raise exception 'media must remain in Trash during finalization'/i);
    expect(sql).toMatch(/substring\(section->>'mediaUrl' from 2 for 1\) not in \('\/', chr\(92\)\)/i);
    expect(sql).not.toMatch(/website_media_deletion_authorizations\s+authorization\b/i);
    expect(sql).not.toMatch(/grant\s+all/i);
  });

  it("keeps privileged mutations behind explicit grants", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /revoke execute on function public\.publish_due_website_content\(integer\)\s+from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.publish_due_website_content\(integer\)\s+to service_role/i,
    );
    expect(sql).toMatch(/alter table public\.website_media enable row level security/i);
    expect(sql).toMatch(
      /alter table public\.website_media_references enable row level security/i,
    );
    expect(sql).toMatch(
      /alter table public\.website_content_audit enable row level security/i,
    );
    expect(sql).not.toMatch(
      /create policy "Website managers delete website media"[\s\S]*?private\.can_manage_website\(\)[\s\S]*?;/i,
    );
    expect(sql).not.toMatch(
      /grant (?:select, )?insert, delete on table public\.website_media_references to authenticated/i,
    );
  });
});
