import { describe, expect, it } from "vitest";

import {
  deduplicateTransactions,
  mapLegacyPayment,
  matchesExpectedYezzaReconciliation,
  parseServiceLines,
  reconcileTransactions,
  type YezzaTransaction,
} from "../../scripts/yezza-import/transformTransactions";
import {
  transformVisit,
  type YezzaConsultation,
} from "../../scripts/yezza-import/transformVisits";

const transaction = (overrides: Partial<YezzaTransaction> = {}): YezzaTransaction => ({
  sourceVisitId: "visit-001",
  billNumber: "bill-001",
  totalAmount: "25.50",
  paidAmount: "25.50",
  method: "CASH",
  channel: "Clinic",
  status: "Paid",
  ...overrides,
});

const consultation = (overrides: Partial<YezzaConsultation> = {}): YezzaConsultation => ({
  sourceVisitId: "visit-001",
  sourcePatientId: "patient-001",
  visitAt: "2025-01-02T03:04:05+08:00",
  visitNote: "Headache for two days",
  diagnosisText: "Tension headache",
  attendingDoctor: "Dr Roster",
  serviceText: "Consultation : 10.00",
  ...overrides,
});

describe("Yezza service and payment transformations", () => {
  it("parses multiline services, retains zero prices, and does not invent quantities", () => {
    expect(parseServiceLines("Consultation : 10.00\nFree sample : 0.00\nBandage : RM 2.50")).toEqual([
      { name: "Consultation", amount: 10, quantity: 1, sourceLine: 1 },
      { name: "Free sample", amount: 0, quantity: 1, sourceLine: 2 },
      { name: "Bandage", amount: 2.5, quantity: 1, sourceLine: 3 },
    ]);
  });

  it("splits on the last delimiter so service names can contain colons", () => {
    expect(parseServiceLines("Test: rapid antigen : 15.00")).toEqual([
      { name: "Test: rapid antigen", amount: 15, quantity: 1, sourceLine: 1 },
    ]);
  });

  it("returns no clinical charge for malformed service lines", () => {
    expect(parseServiceLines("No price\n: 12.00\nConsultation : not-a-number\nValid : 5.00")).toEqual([
      { name: "Valid", amount: 5, quantity: 1, sourceLine: 4 },
    ]);
  });

  it("does not create a payment for a due bill", () => {
    expect(mapLegacyPayment(transaction({ paidAmount: "0.00", status: "Due" }))).toBeNull();
  });

  it("maps a paid bill as exactly one payment for the recorded amount", () => {
    expect(mapLegacyPayment(transaction())).toEqual({
      sourceVisitId: "visit-001",
      sourceBillId: "bill-001",
      amount: 25.5,
      paymentMethod: "cash",
      paymentType: "self_pay",
      notes: "Yezza legacy payment; source_bill_id=bill-001; source_visit_id=visit-001; method=CASH; channel=Clinic; status=Paid",
    });
  });

  it("retains composite payment methods in auditable notes without inventing splits", () => {
    expect(mapLegacyPayment(transaction({ method: "CASH, PMCARE", paidAmount: "80.00" }))).toEqual({
      sourceVisitId: "visit-001",
      sourceBillId: "bill-001",
      amount: 80,
      paymentMethod: "other",
      paymentType: "self_pay",
      notes: "Yezza legacy payment; source_bill_id=bill-001; source_visit_id=visit-001; method=CASH, PMCARE; channel=Clinic; status=Paid",
    });
  });

  it("removes only exact duplicate transaction rows and reconciles the remaining amounts", () => {
    const first = transaction();
    const duplicate = transaction();
    const distinct = transaction({ billNumber: "bill-002", totalAmount: "10.00", paidAmount: "0.00", status: "Due" });

    const unique = deduplicateTransactions([first, duplicate, distinct]);

    expect(unique).toEqual([first, distinct]);
    expect(reconcileTransactions(unique)).toEqual({ uniqueBills: 2, sourceTotal: 35.5, paidTotal: 25.5 });
  });

  it("uses the approved 67,442-bill source reconciliation baseline", () => {
    expect(matchesExpectedYezzaReconciliation({
      uniqueBills: 67_442,
      sourceTotal: 5_684_929.22,
      paidTotal: 1_099_076.0,
    })).toBe(true);
    expect(matchesExpectedYezzaReconciliation({
      uniqueBills: 67_441,
      sourceTotal: 5_684_929.22,
      paidTotal: 1_099_076.0,
    })).toBe(false);
  });
});

describe("Yezza visit transformation", () => {
  it("links queue, consultation, and zero-priced service rows by supplied source-aware IDs", () => {
    const result = transformVisit({
      consultation: consultation({ serviceText: "Consultation : 10.00\nFree document : 0.00" }),
      patientId: "patient-db-id",
      queueEntryId: "queue-db-id",
      consultationId: "consultation-db-id",
      doctorIdsByNormalizedName: { "dr roster": "doctor-db-id" },
    });

    expect(result).toMatchObject({
      sourceVisitId: "visit-001",
      orphanFinancialOnly: false,
      queueEntry: {
        id: "queue-db-id",
        patient_id: "patient-db-id",
        assigned_doctor_id: "doctor-db-id",
        created_at: "2025-01-02T03:04:05+08:00",
        visit_notes: "Headache for two days",
      },
      consultation: {
        id: "consultation-db-id",
        queue_entry_id: "queue-db-id",
        patient_id: "patient-db-id",
        doctor_id: "doctor-db-id",
        diagnosis_text: "Tension headache",
        original_consulted_at: "2025-01-02T03:04:05+08:00",
      },
    });
    expect(result.queueEntry.visit_remarks).toContain("source_visit_id=visit-001");
    expect(result.consultation?.case_note).toContain("source_visit_id=visit-001");
    expect(result.items).toEqual([
      { consultation_id: "consultation-db-id", item_name: "Consultation", quantity: 1, price: 10, sourceLine: 1, sourceVisitId: "visit-001" },
      { consultation_id: "consultation-db-id", item_name: "Free document", quantity: 1, price: 0, sourceLine: 2, sourceVisitId: "visit-001" },
    ]);
  });

  it("leaves unknown doctors unassigned and flags the source name", () => {
    const result = transformVisit({
      consultation: consultation({ attendingDoctor: "Dr Unknown" }),
      patientId: "patient-db-id",
      queueEntryId: "queue-db-id",
      consultationId: "consultation-db-id",
      doctorIdsByNormalizedName: { "dr roster": "doctor-db-id" },
    });

    expect(result.queueEntry.assigned_doctor_id).toBeNull();
    expect(result.consultation?.doctor_id).toBeNull();
    expect(result.unresolvedDoctor).toBe("Dr Unknown");
  });

  it("marks transaction-only visits as financial-only and creates no fabricated consultation", () => {
    const result = transformVisit({
      transaction: transaction({ sourceVisitId: "visit-financial-only", billNumber: "bill-financial-only" }),
      patientId: "patient-db-id",
      queueEntryId: "queue-db-id",
    });

    expect(result).toMatchObject({
      sourceVisitId: "visit-financial-only",
      orphanFinancialOnly: true,
      consultation: null,
      items: [],
      queueEntry: {
        id: "queue-db-id",
        patient_id: "patient-db-id",
        clinic_status: "registered",
        visit_purpose: "legacy-financial-only",
        visit_notes: null,
      },
    });
    expect(result.queueEntry.visit_remarks).toContain("legacy_financial_only=true");
    expect(result.queueEntry.visit_remarks).toContain("clinical_activity_excluded=true");
  });
});
