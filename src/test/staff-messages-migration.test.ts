import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721162256_restore_staff_messages.sql",
  "utf8",
).toLowerCase();

describe("staff_messages migration", () => {
  it("creates and protects the table", () => {
    expect(sql).toContain("create table public.staff_messages");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.staff_messages from anon");
    expect(sql).toContain("grant select, insert on table public.staff_messages to authenticated");
  });

  it("requires clinical staff and sender ownership", () => {
    expect(sql).toContain("public.is_staff_or_clinical((select auth.uid()))");
    expect(sql).toContain("(select auth.uid()) = sender_id");
    expect(sql).not.toContain("website_editor");
  });

  it("adds realtime idempotently", () => {
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("alter publication supabase_realtime add table public.staff_messages");
  });
});
