import { describe, expect, it } from "vitest";

import {
  matchYezzaPatient,
  normalizeName,
  normalizeNationalId,
  normalizePhone,
} from "../../scripts/yezza-import/matchPatients";
import type { ExistingPatient, YezzaPatient } from "../../scripts/yezza-import/types";

const source = (overrides: Partial<YezzaPatient> = {}): YezzaPatient => ({
  sourcePatientId: "yezza-123",
  name: "Nur Aisyah Binti Ali",
  nationalId: "900101-14-5678",
  phone: "012-345 6789",
  dateOfBirth: "1990-01-01",
  address: "12 Jalan Mawar",
  ...overrides,
});

const existing = (overrides: Partial<ExistingPatient> = {}): ExistingPatient => ({
  id: "klinik-456",
  name: "Nur Aisyah Binti Ali",
  nationalId: "900101145678",
  phone: "+60 12 345 6789",
  dateOfBirth: "1990-01-01",
  address: "12 Jalan Mawar",
  ...overrides,
});

describe("Yezza patient normalization", () => {
  it("normalizes Malaysian ICs, passports, names, and Malaysian phone formats", () => {
    expect(normalizeNationalId("900101-14-5678")).toBe("900101145678");
    expect(normalizeNationalId(" a 123 4567 ")).toBe("A1234567");
    expect(normalizeNationalId("   ")).toBeNull();
    expect(normalizePhone("012-345 6789")).toBe("+60123456789");
    expect(normalizePhone("6012 345 6789")).toBe("+60123456789");
    expect(normalizePhone("+60 (12) 345-6789")).toBe("+60123456789");
    expect(normalizePhone("-")).toBeNull();
    expect(normalizeName("  NUR   AISYAH binti ALI ")).toBe("nur aisyah binti ali");
  });
});

describe("matchYezzaPatient", () => {
  it("reuses a patient by exact IC even when the source ID differs", () => {
    const decision = matchYezzaPatient(source(), [existing()]);

    expect(decision).toMatchObject({
      kind: "exact-id",
      existingPatientId: "klinik-456",
      conflicts: [],
    });
  });

  it("reuses a patient by exact passport", () => {
    const decision = matchYezzaPatient(
      source({ nationalId: "A 1234567" }),
      [existing({ nationalId: null, passportNo: "a1234567" })],
    );

    expect(decision).toMatchObject({ kind: "exact-id", existingPatientId: "klinik-456" });
  });

  it("reuses a patient only when phone, normalized name, and DOB all match", () => {
    const decision = matchYezzaPatient(
      source({ nationalId: null, name: " NUR   AISYAH BINTI ALI " }),
      [existing({ nationalId: null })],
    );

    expect(decision).toMatchObject({
      kind: "phone-name-dob",
      existingPatientId: "klinik-456",
      conflicts: [],
    });
  });

  it("does not auto-merge a name-only candidate", () => {
    const decision = matchYezzaPatient(
      source({ nationalId: null, phone: null, dateOfBirth: null }),
      [existing({ nationalId: null, phone: null, dateOfBirth: null })],
    );

    expect(decision).toEqual({
      kind: "new",
      reason: "No deterministic patient match",
      conflicts: [],
    });
  });

  it("flags duplicate existing IC candidates for review without choosing one", () => {
    const firstCandidateId = "11111111-1111-4111-8111-111111111111";
    const secondCandidateId = "22222222-2222-4222-8222-222222222222";
    const decision = matchYezzaPatient(source(), [existing({ id: firstCandidateId }), existing({ id: secondCandidateId })]);

    expect(decision).toEqual({
      kind: "review",
      reason: "National ID matches multiple Klinik Awfa patients",
      conflicts: ["duplicate-existing-national-id:2-candidates"],
    });
    expect(JSON.stringify(decision.conflicts)).not.toContain(firstCandidateId);
    expect(JSON.stringify(decision.conflicts)).not.toContain(secondCandidateId);
  });

  it("handles blank identifiers as a new patient when there is no name and DOB candidate", () => {
    const decision = matchYezzaPatient(
      source({ nationalId: " ", phone: " ", name: "No Identifiers", dateOfBirth: null }),
      [existing({ nationalId: null, passportNo: null, phone: null, name: "Other Patient" })],
    );

    expect(decision).toEqual({
      kind: "new",
      reason: "No deterministic patient match",
      conflicts: [],
    });
  });

  it("sends a name and DOB candidate to review without auto-merging", () => {
    const decision = matchYezzaPatient(
      source({ nationalId: null, phone: null }),
      [existing({ nationalId: null, phone: null })],
    );

    expect(decision).toEqual({
      kind: "review",
      reason: "Name and date of birth match requires review",
      conflicts: [],
    });
  });

  it("reports field conflicts on an exact ID match without changing the existing record", () => {
    const decision = matchYezzaPatient(
      source({ name: "Aisyah Ali", phone: "011-222 3333", dateOfBirth: "1991-02-03", address: "99 Jalan Baru" }),
      [existing()],
    );

    expect(decision).toEqual({
      kind: "exact-id",
      existingPatientId: "klinik-456",
      reason: "Exact national ID match",
      conflicts: ["name", "phone", "dateOfBirth", "address"],
    });
  });

  it("does not report conflicts when optional values are blank on both records", () => {
    const decision = matchYezzaPatient(
      source({ phone: null, dateOfBirth: null, address: null }),
      [existing({ phone: null, dateOfBirth: null, address: null })],
    );

    expect(decision).toMatchObject({
      kind: "exact-id",
      existingPatientId: "klinik-456",
      conflicts: [],
    });
  });
});
