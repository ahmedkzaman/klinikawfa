import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260806100000_add_patient_explorer_rpc.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const followUpMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260806110000_fix_patient_explorer_postcode_and_validation.sql",
);
const followUpMigration = existsSync(followUpMigrationPath)
  ? readFileSync(followUpMigrationPath, "utf8")
  : "";
const integrationContractPath = resolve(
  process.cwd(),
  "stress-tests/phase-d/patient-explorer.contract.sql",
);
const integrationContract = existsSync(integrationContractPath)
  ? readFileSync(integrationContractPath, "utf8")
  : "";

describe("patient explorer RPC migration", () => {
  it("defines the paginated patient-level RPC contract", () => {
    expect(migration).toMatch(
      /create or replace function public\.search_patient_explorer\(\s*p_filters jsonb,\s*p_page integer,\s*p_page_size integer\s*\)/i,
    );
    expect(migration).toMatch(/returns jsonb/i);
    expect(migration).toMatch(/'rows'/i);
    expect(migration).toMatch(/'total_count'/i);
    expect(migration).toMatch(/'page'/i);
    expect(migration).toMatch(/'page_size'/i);
  });

  it("authorizes from auth.uid and the existing clinic access helper only", () => {
    expect(migration).toMatch(/auth\.uid\(\) is null/i);
    expect(migration).toMatch(/public\.is_staff_or_clinical\(auth\.uid\(\)\)/i);
    expect(migration).not.toMatch(/p_(role|authorization|authorized)/i);
  });

  it("rejects invalid page sizes and invalid custom date ranges", () => {
    expect(migration).toMatch(/p_page_size < 1 or p_page_size > 100/i);
    expect(migration).toMatch(/p_page < 1/i);
    expect(migration).toMatch(/custom range requires valid dates/i);
    expect(migration).toMatch(/end date must not be before start date/i);
    expect(migration).toMatch(/custom range cannot exceed 365 calendar days/i);
  });

  it("uses inclusive Asia/Kuala_Lumpur calendar-day visit boundaries", () => {
    expect(migration).toMatch(/timezone\('Asia\/Kuala_Lumpur',\s*queue_entry\.created_at\)::date/i);
    expect(migration).toMatch(/between v_start_date and v_end_date/i);
    expect(migration).toMatch(/date_mode = 'all_time'/i);
  });

  it("aggregates each patient exactly once with stable distinct clinical values", () => {
    expect(migration).toMatch(/group by p\.id/i);
    expect(migration).toMatch(/jsonb_agg\([\s\S]*?order by p\.name, p\.id/i);
    expect(migration).toMatch(/array_agg\(distinct/i);
    expect(migration).toMatch(/s\.category = 'Laboratory Investigation'/i);
    expect(migration).toMatch(/s\.category in \('Procedure', 'General Service', 'Other'\)/i);
  });

  it("preserves source-table RLS and exposes the RPC only to authenticated callers", () => {
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(
      /revoke all on function public\.search_patient_explorer\(jsonb, integer, integer\) from public, anon/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.search_patient_explorer\(jsonb, integer, integer\) to authenticated/i,
    );
    expect(migration).not.toMatch(/disable row level security/i);
    expect(migration).not.toMatch(/security definer/i);
    expect(migration).not.toMatch(/service_role/i);
  });

  it("adds a real nullable postcode column before recreating the deployed RPC", () => {
    expect(followUpMigration).toMatch(
      /alter table public\.patients\s+add column if not exists postcode text/i,
    );
    expect(followUpMigration).toMatch(/'postcode', p\.postcode/i);
    expect(followUpMigration).toMatch(/coalesce\(p\.postcode, ''\) ilike '%' \|\| v_postcode \|\| '%'/i);
    expect(followUpMigration).toMatch(
      /to_regprocedure\('public\.search_patient_explorer\(jsonb, integer, integer\)'\) is null/i,
    );
    expect(followUpMigration).toMatch(
      /create or replace function public\.search_patient_explorer\(/i,
    );
    expect(followUpMigration).not.toMatch(/pg_get_functiondef/i);
  });

  it("accepts valid custom dates and age values with PostgreSQL-safe regexes", () => {
    expect(followUpMigration).toContain("start_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(followUpMigration).toContain("end_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(followUpMigration).toContain("filters ->> 'ageMin' !~ '^[0-9]+$'");
    expect(followUpMigration).toContain("filters ->> 'ageMax' !~ '^[0-9]+$'");
    expect(followUpMigration).not.toContain("\\\\d");
  });

  it("requires dateMode explicitly and rejects missing or null values", () => {
    expect(followUpMigration).toMatch(
      /if date_mode is null or date_mode not in \('all_time', 'custom'\) then/i,
    );
    expect(followUpMigration).toContain("date mode must be all_time or custom");
  });

  it("ships an executable PostgreSQL integration contract as supplemental coverage", () => {
    expect(integrationContract).toContain(
      "\\ir ../../supabase/migrations/20260806100000_add_patient_explorer_rpc.sql",
    );
    expect(integrationContract).toContain(
      "\\ir ../../supabase/migrations/20260806110000_fix_patient_explorer_postcode_and_validation.sql",
    );
    expect(integrationContract).toMatch(/begin;[\s\S]*rollback;/i);
    expect(integrationContract).toMatch(/search_patient_explorer/i);
    expect(integrationContract).toMatch(/missing dateMode/i);
    expect(integrationContract).toMatch(/anonymous request/i);
    const rlsRunner = readFileSync(
      resolve(process.cwd(), "stress-tests/scripts/run-rls-matrix.sh"),
      "utf8",
    );
    expect(rlsRunner).toContain("phase-d/patient-explorer.contract.sql");
  });

  it("cleans Phase-D fixtures before the patient explorer contract can fail", () => {
    const rlsRunner = readFileSync(
      resolve(process.cwd(), "stress-tests/scripts/run-rls-matrix.sh"),
      "utf8",
    );

    expect(rlsRunner.indexOf("trap cleanup EXIT INT TERM")).toBeGreaterThan(-1);
    expect(rlsRunner.indexOf("trap cleanup EXIT INT TERM")).toBeLessThan(
      rlsRunner.indexOf("phase-d/patient-explorer.contract.sql"),
    );
  });

  it("uses a Kuala Lumpur fixture date and unique patient filters", () => {
    expect(integrationContract).toMatch(
      /request_date text := to_char\(current_timestamp at time zone 'Asia\/Kuala_Lumpur', 'YYYY-MM-DD'\)/i,
    );
    expect(integrationContract).toMatch(
      /fixture_name constant text := 'Patient Explorer Contract Fixture ae100001-0000-4000-8000-000000000001'/i,
    );
    expect(
      integrationContract.match(/'patientName', fixture_name/g),
    ).toHaveLength(3);
  });
});
