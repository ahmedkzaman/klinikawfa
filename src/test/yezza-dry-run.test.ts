import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { runDryRun } from "../../scripts/yezza-import/dryRun";

const patientOneId = "33333333-3333-4333-8333-333333333333";
const patientTwoId = "44444444-4444-4444-8444-444444444444";
const patientThreeId = "55555555-5555-4555-8555-555555555555";

describe("Yezza dry-run reports", () => {
  const insert = vi.fn();
  const update = vi.fn();
  const upsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          range: vi.fn(async () => ({
            data: table === "patients"
              ? [
                  { id: patientOneId, name: "Nur Aisyah", national_id: "900101145678", passport_no: null, phone: "+60123456789", date_of_birth: "1990-01-01", address: "Jalan Mawar" },
                  { id: patientTwoId, name: "Duplicate Person", national_id: "A1234567", passport_no: null, phone: null, date_of_birth: "1988-02-02", address: null },
                  { id: patientThreeId, name: "Duplicate Person", national_id: "A1234567", passport_no: null, phone: null, date_of_birth: "1988-02-02", address: null },
                ]
              : [{ name: "Dr Roster" }],
            error: null,
          })),
        })),
        insert,
        update,
        upsert,
      })),
    });
  });

  it("creates only sanitized reports after deduplication and performs no production writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "yezza-dry-run-"));
    const inputDirectory = join(root, "input");
    const outputDirectory = join(root, "reports");
    await mkdir(inputDirectory);
    try {
      await Promise.all([
        writeFile(join(inputDirectory, "patients.csv"), "PatientID,Patient Name,IC/Passport,Phone,DOB,Address\nsource-patient-one,Nur Aisyah,900101-14-5678,012-345 6789,1990-01-01,Jalan Mawar\nsource-patient-duplicate,Duplicate Person,A1234567,,1988-02-02,\n", "utf8"),
        writeFile(join(inputDirectory, "consultations.csv"), "Visit ID,Attending Dr\nv-1,Dr Roster\nv-2,Dr Unknown\n", "utf8"),
        writeFile(join(inputDirectory, "transactions_1.csv"), "Visit ID,Bill#,Total,Paid Amount,Method,Channel\nv-1,b-1,10.00,10.00,CASH,Clinic\nv-2,b-2,20.00,0.00,CASH,Clinic\n", "utf8"),
        writeFile(join(inputDirectory, "transactions_2.csv"), "Visit ID,Bill#,Total,Paid Amount,Method,Channel\nv-1,b-1,10.00,10.00,CASH,Clinic\nv-3,b-3,30.00,30.00,CARD,Clinic\n", "utf8"),
      ]);
      vi.stubEnv("YEZZA_SUPABASE_URL", "https://example.invalid");
      vi.stubEnv("YEZZA_SUPABASE_SERVICE_ROLE_KEY", "test-key");

      await runDryRun({ inputDirectory, outputDirectory });

      expect((await readdir(outputDirectory)).sort()).toEqual([
        "orphan_financial_visits.csv",
        "patient_matches.csv",
        "patient_review.csv",
        "summary.json",
        "unresolved_doctors.csv",
      ]);
      const reportContents = await Promise.all((await readdir(outputDirectory)).map((filename) => readFile(join(outputDirectory, filename), "utf8")));
      const combined = reportContents.join("\n");
      for (const rawIdentifier of [
        "source-patient-one",
        "source-patient-duplicate",
        "900101145678",
        "012-345 6789",
        "Nur Aisyah",
        "Duplicate Person",
        patientOneId,
        patientTwoId,
        patientThreeId,
      ]) {
        expect(combined).not.toContain(rawIdentifier);
      }
      expect(JSON.parse(await readFile(join(outputDirectory, "summary.json"), "utf8"))).toMatchObject({
        uniqueTransactions: 3,
        duplicateTransactionsRemoved: 1,
        orphanFinancialVisits: 1,
        writesPerformed: 0,
      });
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });
});
