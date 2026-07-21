import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260721174422_preserve_source_cutover_fields.sql",
  "utf8",
).toLowerCase();
const runner = readFileSync("scripts/cutover/database-reconcile.ps1", "utf8").toLowerCase();

describe("source cutover compatibility migration", () => {
  it.each([
    "patient_ic text",
    "service_slug text",
    "payment_reference text",
    "updated_at timestamp with time zone default now()",
  ])("preserves appointments field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it.each([
    "cancelled_at timestamp with time zone",
    "cancelled_by uuid",
    "cancellation_reason text",
    "queue_sequence integer",
  ])("preserves queue field %s", (definition) => {
    expect(sql).toContain(definition);
  });

  it("restores both source foreign keys", () => {
    expect(sql).toContain("foreign key (service_slug) references public.clinic_services(slug)");
    expect(sql).toContain("foreign key (cancelled_by) references auth.users(id)");
  });

  it("preserves the source queue cancellation status without remapping data", () => {
    expect(sql).toContain(
      "alter type public.clinic_status add value if not exists 'cancelled'",
    );
    expect(runner).not.toMatch(/clinic_status[^\r\n]+replace/);
  });

  it("does not replace the authoritative target appointment columns or default", () => {
    expect(sql).not.toMatch(/drop\s+column/);
    expect(sql).not.toContain("alter column status set default");
    expect(sql).not.toContain("patient_name text");
    expect(sql).not.toContain("patient_phone text");
  });
});

describe("cutover compatibility rehearsal", () => {
  it.each([
    ["patient_name", "name"],
    ["patient_phone", "phone"],
    ["appointment_date", "preferred_date"],
    ["appointment_time", "preferred_time"],
  ])("maps appointments column %s to %s", (source, target) => {
    expect(runner).toContain(`'${source}' = '${target}'`);
  });

  it("rewrites only the generated appointments inserts", () => {
    expect(runner).toContain("function convert-appointmentinsertcolumns");
    expect(runner).toContain("$body = convert-appointmentinsertcolumns -sql $body");
  });

  it.each([
    "20260721162256_restore_staff_messages.sql",
    "20260721174422_preserve_source_cutover_fields.sql",
  ])("applies %s to disposable target scratch", (migration) => {
    expect(runner).toContain(migration);
    expect(runner).toMatch(/invoke-localfile -database \$targetdatabase -path \$[a-z]+migration/);
  });

  it("never applies either migration to the target", () => {
    expect(runner).not.toMatch(
      /invoke-targetfile[^\r\n]+\$(?:staffmessages|compatibility)migration/,
    );
  });
});
