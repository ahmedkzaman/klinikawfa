import { describe, expect, it } from "vitest";

import {
  ImportHttpError,
  createYezzaImportHandler,
  prepareYezzaImport,
  type ApprovedDryRun,
  type ImportApplyResult,
  type ImportGateway,
  type YezzaImportPayload,
} from "../../supabase/functions/yezza-import/import-core";

const ADMIN_ID = "75000000-0000-4000-8000-000000000001";

function payload(overrides: Partial<YezzaImportPayload> = {}): YezzaImportPayload {
  return {
    sourceBatchId: "yezza-2026-08-06-001",
    reviewCounts: {
      patientReview: 1,
      unresolvedDoctors: 0,
      orphanFinancialVisits: 0,
    },
    patients: [
      {
        sourcePatientId: "patient-001",
        patient: {
          name: "Test Patient",
          phone: "+60123456789",
          nationalId: "900101145678",
          dateOfBirth: "1990-01-01",
        },
      },
    ],
    visits: [
      {
        sourceVisitId: "visit-001",
        sourcePatientId: "patient-001",
        queueEntry: {
          clinicStatus: "registered",
          visitPurpose: "consultation",
          visitNotes: "Historical visit",
          visitRemarks: "source_system=yezza; source_visit_id=visit-001",
          createdAt: "2025-01-02T03:04:05.000Z",
        },
        consultation: {
          doctorId: null,
          caseNote: "Historical note",
          diagnosisText: "",
          originalConsultedAt: "2025-01-02T03:04:05.000Z",
        },
        items: [
          { sourceLine: 1, itemName: "Consultation", quantity: 1, price: 35 },
        ],
        transactions: [
          {
            sourceBillId: "bill-001",
            amount: 35,
            paidAmount: 35,
            paymentMethod: "cash",
            paymentType: "self_pay",
            notes: "Yezza legacy payment; source_bill_id=bill-001",
          },
        ],
      },
    ],
    ...overrides,
  };
}

type StoredRows = {
  patients: Set<string>;
  visits: Set<string>;
  items: Set<string>;
  payments: Set<string>;
  patientExternalIds: Map<string, string>;
  transactionExternalIds: Set<string>;
};

class TransactionalGateway implements ImportGateway {
  approvals = new Map<string, ApprovedDryRun & { importBatchId: string; status: string; result?: ImportApplyResult }>();
  rows: StoredRows = {
    patients: new Set(),
    visits: new Set(),
    items: new Set(),
    payments: new Set(),
    patientExternalIds: new Map(),
    transactionExternalIds: new Set(),
  };
  failAfterItems = false;

  async approve(input: ApprovedDryRun): Promise<{ importBatchId: string; status: "approved" }> {
    const prior = [...this.approvals.values()].find((approval) =>
      approval.payload.sourceBatchId === input.payload.sourceBatchId && approval.payloadHash === input.payloadHash
    );
    if (prior) return { importBatchId: prior.importBatchId, status: "approved" };
    const importBatchId = `75000000-0000-4000-8000-${String(this.approvals.size + 101).padStart(12, "0")}`;
    this.approvals.set(importBatchId, { ...input, importBatchId, status: "approved" });
    return { importBatchId, status: "approved" };
  }

  async apply(input: {
    importBatchId: string;
    actorId: string;
    payloadHash: string;
    payload: YezzaImportPayload;
  }): Promise<ImportApplyResult> {
    const approval = this.approvals.get(input.importBatchId);
    if (approval?.result && approval.payloadHash === input.payloadHash) {
      return { ...approval.result, idempotent: true };
    }
    if (!approval || approval.status !== "approved" || approval.payloadHash !== input.payloadHash) {
      throw new ImportHttpError(409, "Import batch is not approved");
    }

    const snapshot = structuredClone(this.rows);
    try {
      for (const patient of input.payload.patients) {
        const existing = this.rows.patientExternalIds.get(patient.sourcePatientId);
        const patientId = existing ?? patient.existingPatientId ?? `new:${patient.sourcePatientId}`;
        if (!existing && !patient.existingPatientId) this.rows.patients.add(patientId);
        this.rows.patientExternalIds.set(patient.sourcePatientId, patientId);
      }
      for (const visit of input.payload.visits) {
        if (!this.rows.visits.has(visit.sourceVisitId)) {
          this.rows.visits.add(visit.sourceVisitId);
          for (const item of visit.items) this.rows.items.add(`${visit.sourceVisitId}:${item.sourceLine}`);
        }
        if (this.failAfterItems) throw new Error("forced import failure");
        for (const transaction of visit.transactions) {
          if (this.rows.transactionExternalIds.has(transaction.sourceBillId)) continue;
          if (transaction.paidAmount > 0) this.rows.payments.add(transaction.sourceBillId);
          this.rows.transactionExternalIds.add(transaction.sourceBillId);
        }
      }
    } catch {
      this.rows = snapshot;
      approval.status = "failed";
      return { status: "failed", importedCounts: {}, idempotent: false, errorCode: "YEZZA_IMPORT_FAILED" };
    }

    const result: ImportApplyResult = {
      status: "completed",
      importedCounts: {
        patients: this.rows.patients.size,
        visits: this.rows.visits.size,
        consultationItems: this.rows.items.size,
        payments: this.rows.payments.size,
        transactions: this.rows.transactionExternalIds.size,
      },
      idempotent: false,
    };
    approval.status = "completed";
    approval.result = result;
    return result;
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function request(action: string, body: unknown): Request {
  return new Request(`https://example.invalid/yezza-import?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

describe("guarded Yezza import endpoint", () => {
  it("rejects unauthorized callers before reading or applying a batch", async () => {
    const gateway = new TransactionalGateway();
    const handler = createYezzaImportHandler({
      authorize: async () => { throw new ImportHttpError(401, "Unauthorized"); },
      gateway,
    });

    const response = await handler(request("dry-run", payload()));

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "Unauthorized" });
    expect(gateway.approvals.size).toBe(0);
  });

  it("rejects an authenticated non-admin database role", async () => {
    const gateway = new TransactionalGateway();
    const handler = createYezzaImportHandler({
      authorize: async () => ({ userId: ADMIN_ID, role: "staff" }),
      gateway,
    });

    const response = await handler(request("dry-run", payload()));

    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "Forbidden" });
    expect(gateway.approvals.size).toBe(0);
  });

  it("keeps dry-run write-free and returns derived counts plus sanitized review artifact names", async () => {
    const gateway = new TransactionalGateway();
    const handler = createYezzaImportHandler({
      authorize: async () => ({ userId: ADMIN_ID, role: "admin" }),
      gateway,
    });

    const response = await handler(request("dry-run", payload()));
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(body.counts).toEqual({ patients: 1, visits: 1, consultations: 1, consultationItems: 1, transactions: 1, payments: 1 });
    expect(body.reviewArtifacts).toEqual(["patient_matches.csv", "patient_review.csv", "summary.json"]);
    expect(body.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(gateway.approvals.size).toBe(0);
  });

  it("rejects apply when no admin approval exists for the batch and payload hash", async () => {
    const gateway = new TransactionalGateway();
    const handler = createYezzaImportHandler({ authorize: async () => ({ userId: ADMIN_ID, role: "doctor_admin" }), gateway });

    const response = await handler(request("apply", {
      importBatchId: "75000000-0000-4000-8000-000000000999",
      payload: payload(),
    }));

    expect(response.status).toBe(409);
    expect(await responseJson(response)).toEqual({ error: "Import batch is not approved" });
  });

  it("returns the existing result when the same approved source batch is retried", async () => {
    const gateway = new TransactionalGateway();
    const handler = createYezzaImportHandler({ authorize: async () => ({ userId: ADMIN_ID, role: "admin" }), gateway });
    const prepared = await prepareYezzaImport(payload());
    const approvalResponse = await handler(request("approve", { payload: payload(), expectedPayloadHash: prepared.payloadHash }));
    const importBatchId = (await responseJson(approvalResponse)).importBatchId as string;

    const first = await handler(request("apply", { importBatchId, payload: payload() }));
    const retry = await handler(request("apply", { importBatchId, payload: payload() }));

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(await responseJson(retry)).toMatchObject({ status: "completed", idempotent: true });
    expect([...gateway.rows.visits]).toEqual(["visit-001"]);
    expect([...gateway.rows.items]).toEqual(["visit-001:1"]);
    expect([...gateway.rows.payments]).toEqual(["bill-001"]);
  });

  it("reuses a patient already bound through patient_external_ids", async () => {
    const gateway = new TransactionalGateway();
    gateway.rows.patientExternalIds.set("patient-001", "existing-patient-db-id");
    const handler = createYezzaImportHandler({ authorize: async () => ({ userId: ADMIN_ID, role: "admin" }), gateway });
    const prepared = await prepareYezzaImport(payload());
    const approved = await handler(request("approve", { payload: payload(), expectedPayloadHash: prepared.payloadHash }));
    const importBatchId = (await responseJson(approved)).importBatchId as string;

    await handler(request("apply", { importBatchId, payload: payload() }));

    expect(gateway.rows.patientExternalIds.get("patient-001")).toBe("existing-patient-db-id");
    expect(gateway.rows.patients.size).toBe(0);
  });

  it("deduplicates repeated source bills before creating payments and transaction identities", async () => {
    const duplicated = payload();
    duplicated.visits[0].transactions.push({ ...duplicated.visits[0].transactions[0] });
    const prepared = await prepareYezzaImport(duplicated);

    expect(prepared.payload.visits[0].transactions).toHaveLength(1);
    expect(prepared.counts).toMatchObject({ transactions: 1, payments: 1 });
  });

  it("rolls back patient, visit, item, and payment writes when a batch fails", async () => {
    const gateway = new TransactionalGateway();
    gateway.failAfterItems = true;
    const handler = createYezzaImportHandler({ authorize: async () => ({ userId: ADMIN_ID, role: "admin" }), gateway });
    const prepared = await prepareYezzaImport(payload());
    const approved = await handler(request("approve", { payload: payload(), expectedPayloadHash: prepared.payloadHash }));
    const importBatchId = (await responseJson(approved)).importBatchId as string;

    const response = await handler(request("apply", { importBatchId, payload: payload() }));

    expect(response.status).toBe(409);
    expect(await responseJson(response)).toMatchObject({ error: "Yezza import batch failed", errorCode: "YEZZA_IMPORT_FAILED" });
    expect(gateway.rows.patients.size).toBe(0);
    expect(gateway.rows.patientExternalIds.size).toBe(0);
    expect(gateway.rows.visits.size).toBe(0);
    expect(gateway.rows.items.size).toBe(0);
    expect(gateway.rows.payments.size).toBe(0);
    expect(gateway.rows.transactionExternalIds.size).toBe(0);
  });
});
