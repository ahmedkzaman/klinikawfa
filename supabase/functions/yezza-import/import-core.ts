export const YEZZA_IMPORT_MAX_BYTES = 8 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_ROLES = new Set(["admin", "doctor_admin"]);
const MAX_ROWS_PER_BATCH = 2_000;

export class ImportHttpError extends Error {
  constructor(public status: number, public safeMessage: string) {
    super(safeMessage);
  }
}

export interface YezzaImportPayload {
  sourceBatchId: string;
  manifestHash: string;
  resolutionHash: string;
  batchIndex: number;
  batchCount: number;
  reviewCounts: {
    patientReview: number;
    unresolvedDoctors: number;
    orphanFinancialVisits: number;
  };
  patients: Array<{
    sourcePatientId: string;
    reviewLocator?: string;
    existingPatientId?: string;
    patient?: {
      name: string;
      phone?: string | null;
      email?: string | null;
      nationalId?: string | null;
      passportNo?: string | null;
      address?: string | null;
      regNo?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
      stateOfBirth?: string | null;
      allergies?: string | null;
      underlyingConditions?: string | null;
      registrationDate?: string | null;
      notes?: string | null;
    };
  }>;
  visits: Array<{
    sourceVisitId: string;
    sourcePatientId: string;
    doctorReviewKey?: string;
    queueEntry: {
      clinicStatus: "registered";
      assignedDoctorId?: string | null;
      visitPurpose: "consultation" | "legacy-financial-only";
      visitNotes?: string | null;
      visitRemarks: string;
      paymentMethod?: string | null;
      isUrgent?: boolean;
      createdAt?: string | null;
    };
    consultation?: {
      doctorId?: string | null;
      caseNote: string;
      diagnosisText: string;
      originalConsultedAt: string;
    } | null;
    items: Array<{
      sourceLine: number;
      itemName: string;
      quantity: 1;
      price: number;
    }>;
    transactions: Array<{
      sourceBillId: string;
      amount: number;
      paidAmount: number;
      paymentMethod: "cash" | "card" | "bank_transfer" | "e_wallet" | "panel" | "other";
      paymentType: "self_pay";
      notes: string;
    }>;
  }>;
}

export interface ImportCounts {
  patients: number;
  visits: number;
  consultations: number;
  consultationItems: number;
  transactions: number;
  payments: number;
}

export interface PreparedYezzaImport {
  payload: YezzaImportPayload;
  payloadHash: string;
  counts: ImportCounts;
  reviewCounts: YezzaImportPayload["reviewCounts"];
  reviewArtifacts: string[];
}

export interface ApprovedDryRun extends PreparedYezzaImport {
  actorId: string;
}

export interface ImportApplyResult {
  status: "completed" | "failed";
  importedCounts: Record<string, number>;
  idempotent: boolean;
  errorCode?: string;
}

export interface ImportGateway {
  approve(input: ApprovedDryRun): Promise<{ importBatchId: string; status: "approved" }>;
  apply(input: {
    importBatchId: string;
    actorId: string;
    payloadHash: string;
    payload: YezzaImportPayload;
  }): Promise<ImportApplyResult>;
}

export interface ImportActor {
  userId: string;
  role: string;
}

type ImportHandlerDependencies = {
  authorize(req: Request): Promise<ImportActor>;
  gateway: ImportGateway;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ImportHttpError(400, `Invalid ${field}`);
  return value;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new ImportHttpError(400, `Invalid ${field}`);
  if (value.length > MAX_ROWS_PER_BATCH) throw new ImportHttpError(413, `${field} exceeds batch limit`);
  return value;
}

function requiredString(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new ImportHttpError(400, `Invalid ${field}`);
  }
  return value.trim();
}

function nullableString(value: unknown, field: string, maxLength = 10_000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) throw new ImportHttpError(400, `Invalid ${field}`);
  return value;
}

function uuid(value: unknown, field: string): string {
  const result = requiredString(value, field, 36);
  if (!UUID_PATTERN.test(result)) throw new ImportHttpError(400, `Invalid ${field}`);
  return result;
}

function optionalUuid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return uuid(value, field);
}

function nonnegativeMoney(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || Math.round(value * 100) !== value * 100) {
    throw new ImportHttpError(400, `Invalid ${field}`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ImportHttpError(400, `Invalid ${field}`);
  }
  return value;
}

function validateIsoDate(value: unknown, field: string, dateOnly = false): string {
  const result = requiredString(value, field, 40);
  if (dateOnly ? !/^\d{4}-\d{2}-\d{2}$/.test(result) : !Number.isFinite(Date.parse(result))) {
    throw new ImportHttpError(400, `Invalid ${field}`);
  }
  return result;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedPatient(value: unknown): YezzaImportPayload["patients"][number] {
  const row = requiredRecord(value, "patient row");
  const sourcePatientId = requiredString(row.sourcePatientId, "sourcePatientId", 256);
  const existingPatientId = optionalUuid(row.existingPatientId, "existingPatientId");
  const reviewLocator = row.reviewLocator === undefined ? undefined : requiredString(row.reviewLocator, "reviewLocator", 100);
  if (reviewLocator && !/^patients\.csv:\d+$/.test(reviewLocator)) throw new ImportHttpError(400, "Invalid reviewLocator");
  const profile = row.patient === undefined ? undefined : requiredRecord(row.patient, "patient profile");
  if (!existingPatientId && !profile) throw new ImportHttpError(400, "New patient profile is required");
  if (existingPatientId && profile) throw new ImportHttpError(400, "Patient row cannot create and reuse simultaneously");

  return {
    sourcePatientId,
    ...(reviewLocator ? { reviewLocator } : {}),
    ...(existingPatientId ? { existingPatientId } : {}),
    ...(profile ? {
      patient: {
        name: requiredString(profile.name, "patient.name", 500),
        phone: nullableString(profile.phone, "patient.phone", 100),
        email: nullableString(profile.email, "patient.email", 320),
        nationalId: nullableString(profile.nationalId, "patient.nationalId", 200),
        passportNo: nullableString(profile.passportNo, "patient.passportNo", 200),
        address: nullableString(profile.address, "patient.address", 1000),
        regNo: nullableString(profile.regNo, "patient.regNo", 100),
        dateOfBirth: profile.dateOfBirth == null ? profile.dateOfBirth as null | undefined : validateIsoDate(profile.dateOfBirth, "patient.dateOfBirth", true),
        gender: nullableString(profile.gender, "patient.gender", 100),
        stateOfBirth: nullableString(profile.stateOfBirth, "patient.stateOfBirth", 200),
        allergies: nullableString(profile.allergies, "patient.allergies"),
        underlyingConditions: nullableString(profile.underlyingConditions, "patient.underlyingConditions"),
        registrationDate: profile.registrationDate == null ? profile.registrationDate as null | undefined : validateIsoDate(profile.registrationDate, "patient.registrationDate", true),
        notes: nullableString(profile.notes, "patient.notes"),
      },
    } : {}),
  };
}

function normalizedVisit(value: unknown): YezzaImportPayload["visits"][number] {
  const row = requiredRecord(value, "visit row");
  const queue = requiredRecord(row.queueEntry, "queueEntry");
  const clinicStatus = requiredString(queue.clinicStatus, "queueEntry.clinicStatus", 30);
  const visitPurpose = requiredString(queue.visitPurpose, "queueEntry.visitPurpose", 50);
  if (clinicStatus !== "registered") throw new ImportHttpError(400, "Imported clinicStatus must be registered");
  if (visitPurpose !== "consultation" && visitPurpose !== "legacy-financial-only") {
    throw new ImportHttpError(400, "Invalid queueEntry.visitPurpose");
  }

  const consultationRecord = row.consultation == null ? null : requiredRecord(row.consultation, "consultation");
  if (visitPurpose === "consultation" && !consultationRecord) throw new ImportHttpError(400, "Consultation payload is required");
  if (visitPurpose === "legacy-financial-only" && consultationRecord) throw new ImportHttpError(400, "Financial-only visit cannot include a consultation");

  const items = requiredArray(row.items, "items").map((itemValue) => {
    const item = requiredRecord(itemValue, "consultation item");
    const quantity = nonnegativeInteger(item.quantity, "item.quantity");
    if (quantity !== 1) throw new ImportHttpError(400, "Imported item quantity must be one");
    return {
      sourceLine: nonnegativeInteger(item.sourceLine, "item.sourceLine"),
      itemName: requiredString(item.itemName, "item.itemName", 1_000),
      quantity: 1 as const,
      price: nonnegativeMoney(item.price, "item.price"),
    };
  });
  const sourceLines = new Set<number>();
  for (const item of items) {
    if (sourceLines.has(item.sourceLine)) {
      throw new ImportHttpError(400, "Duplicate consultation item source key");
    }
    sourceLines.add(item.sourceLine);
  }
  if (!consultationRecord && items.length > 0) throw new ImportHttpError(400, "Financial-only visit cannot include consultation items");

  const paymentMethods = new Set(["cash", "card", "bank_transfer", "e_wallet", "panel", "other"]);
  const transactions = requiredArray(row.transactions, "transactions").map((transactionValue) => {
    const transaction = requiredRecord(transactionValue, "transaction");
    const paymentMethod = requiredString(transaction.paymentMethod, "transaction.paymentMethod", 30);
    if (!paymentMethods.has(paymentMethod)) throw new ImportHttpError(400, "Invalid transaction.paymentMethod");
    if (transaction.paymentType !== "self_pay") throw new ImportHttpError(400, "Invalid transaction.paymentType");
    return {
      sourceBillId: requiredString(transaction.sourceBillId, "transaction.sourceBillId", 256),
      amount: nonnegativeMoney(transaction.amount, "transaction.amount"),
      paidAmount: nonnegativeMoney(transaction.paidAmount, "transaction.paidAmount"),
      paymentMethod: paymentMethod as YezzaImportPayload["visits"][number]["transactions"][number]["paymentMethod"],
      paymentType: "self_pay" as const,
      notes: requiredString(transaction.notes, "transaction.notes", 5_000),
    };
  });

  return {
    sourceVisitId: requiredString(row.sourceVisitId, "sourceVisitId", 256),
    sourcePatientId: requiredString(row.sourcePatientId, "sourcePatientId", 256),
    ...(row.doctorReviewKey === undefined ? {} : { doctorReviewKey: requiredString(row.doctorReviewKey, "doctorReviewKey", 100) }),
    queueEntry: {
      clinicStatus: "registered",
      assignedDoctorId: optionalUuid(queue.assignedDoctorId, "queueEntry.assignedDoctorId"),
      visitPurpose,
      visitNotes: nullableString(queue.visitNotes, "queueEntry.visitNotes"),
      visitRemarks: requiredString(queue.visitRemarks, "queueEntry.visitRemarks", 5_000),
      paymentMethod: nullableString(queue.paymentMethod, "queueEntry.paymentMethod", 100),
      isUrgent: queue.isUrgent === undefined ? false : Boolean(queue.isUrgent),
      createdAt: queue.createdAt == null ? queue.createdAt as null | undefined : validateIsoDate(queue.createdAt, "queueEntry.createdAt"),
    },
    consultation: consultationRecord ? {
      doctorId: optionalUuid(consultationRecord.doctorId, "consultation.doctorId"),
      caseNote: requiredString(consultationRecord.caseNote, "consultation.caseNote", 100_000),
      diagnosisText: typeof consultationRecord.diagnosisText === "string" ? consultationRecord.diagnosisText : "",
      originalConsultedAt: validateIsoDate(consultationRecord.originalConsultedAt, "consultation.originalConsultedAt"),
    } : null,
    items,
    transactions,
  };
}

function deduplicateTransactions(payload: YezzaImportPayload): YezzaImportPayload {
  const seen = new Map<string, string>();
  const visits = payload.visits.map((visit) => ({
    ...visit,
    transactions: visit.transactions.filter((transaction) => {
      const fingerprint = canonicalJson(transaction);
      const prior = seen.get(transaction.sourceBillId);
      if (prior === fingerprint) return false;
      if (prior) throw new ImportHttpError(400, "Conflicting duplicate source bill");
      seen.set(transaction.sourceBillId, fingerprint);
      return true;
    }),
  }));
  return { ...payload, visits };
}

export async function prepareYezzaImport(value: unknown): Promise<PreparedYezzaImport> {
  const input = requiredRecord(value, "import payload");
  const patients = requiredArray(input.patients, "patients").map(normalizedPatient);
  const visits = requiredArray(input.visits, "visits").map(normalizedVisit);

  const patientIds = new Set<string>();
  for (const patient of patients) {
    if (patientIds.has(patient.sourcePatientId)) throw new ImportHttpError(400, "Duplicate source patient");
    patientIds.add(patient.sourcePatientId);
  }
  const visitIds = new Set<string>();
  for (const visit of visits) {
    if (visitIds.has(visit.sourceVisitId)) throw new ImportHttpError(400, "Duplicate source visit");
    if (!patientIds.has(visit.sourcePatientId)) throw new ImportHttpError(400, "Visit references an absent source patient");
    visitIds.add(visit.sourceVisitId);
  }

  const reviewCounts = {
    patientReview: new Set(patients.flatMap((patient) => patient.reviewLocator ? [patient.reviewLocator] : [])).size,
    unresolvedDoctors: new Set(visits.flatMap((visit) => visit.doctorReviewKey ? [visit.doctorReviewKey] : [])).size,
    orphanFinancialVisits: visits.filter((visit) => visit.queueEntry.visitPurpose === "legacy-financial-only").length,
  };
  const manifestHash = requiredString(input.manifestHash, "manifestHash", 64);
  const resolutionHash = requiredString(input.resolutionHash, "resolutionHash", 64);
  if (!HASH_PATTERN.test(manifestHash) || !HASH_PATTERN.test(resolutionHash)) throw new ImportHttpError(400, "Invalid manifest binding");
  const batchIndex = nonnegativeInteger(input.batchIndex, "batchIndex");
  const batchCount = nonnegativeInteger(input.batchCount, "batchCount");
  if (batchIndex < 1 || batchCount < 1 || batchIndex > batchCount) throw new ImportHttpError(400, "Invalid batch position");

  const payload = deduplicateTransactions({
    sourceBatchId: requiredString(input.sourceBatchId, "sourceBatchId", 128),
    manifestHash,
    resolutionHash,
    batchIndex,
    batchCount,
    reviewCounts,
    patients,
    visits,
  });
  const counts: ImportCounts = {
    patients: payload.patients.length,
    visits: payload.visits.length,
    consultations: payload.visits.filter((visit) => visit.consultation).length,
    consultationItems: payload.visits.reduce((total, visit) => total + visit.items.length, 0),
    transactions: payload.visits.reduce((total, visit) => total + visit.transactions.length, 0),
    payments: payload.visits.reduce((total, visit) => total + visit.transactions.filter((transaction) => transaction.paidAmount > 0).length, 0),
  };
  const reviewArtifacts = [
    "patient_matches.csv",
    ...(payload.reviewCounts.patientReview > 0 ? ["patient_review.csv"] : []),
    ...(payload.reviewCounts.unresolvedDoctors > 0 ? ["unresolved_doctors.csv"] : []),
    ...(payload.reviewCounts.orphanFinancialVisits > 0 ? ["orphan_financial_visits.csv"] : []),
    "summary.json",
  ];
  return { payload, counts, reviewCounts, reviewArtifacts, payloadHash: await sha256(canonicalJson(payload)) };
}

async function readRequestJson(req: Request): Promise<unknown> {
  const contentLength = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > YEZZA_IMPORT_MAX_BYTES) {
    throw new ImportHttpError(413, "Payload too large");
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > YEZZA_IMPORT_MAX_BYTES) {
    throw new ImportHttpError(413, "Payload too large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportHttpError(400, "Invalid request");
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export function createYezzaImportHandler(dependencies: ImportHandlerDependencies): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return json(200, { ok: true });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    try {
      const actor = await dependencies.authorize(req);
      if (!ALLOWED_ROLES.has(actor.role)) throw new ImportHttpError(403, "Forbidden");
      const body = requiredRecord(await readRequestJson(req), "request");
      const action = new URL(req.url).searchParams.get("action");

      if (action === "dry-run") {
        const prepared = await prepareYezzaImport(body);
        return json(200, {
          sourceBatchId: prepared.payload.sourceBatchId,
          payloadHash: prepared.payloadHash,
          manifestHash: prepared.payload.manifestHash,
          resolutionHash: prepared.payload.resolutionHash,
          counts: prepared.counts,
          reviewCounts: prepared.payload.reviewCounts,
          reviewArtifacts: prepared.reviewArtifacts,
          writesPerformed: 0,
        });
      }

      if (action === "approve") {
        const prepared = await prepareYezzaImport(body.payload);
        const expectedPayloadHash = requiredString(body.expectedPayloadHash, "expectedPayloadHash", 64);
        const expectedManifestHash = requiredString(body.expectedManifestHash, "expectedManifestHash", 64);
        const expectedResolutionHash = requiredString(body.expectedResolutionHash, "expectedResolutionHash", 64);
        if (
          !HASH_PATTERN.test(expectedPayloadHash)
          || !HASH_PATTERN.test(expectedManifestHash)
          || !HASH_PATTERN.test(expectedResolutionHash)
          || expectedPayloadHash !== prepared.payloadHash
          || expectedManifestHash !== prepared.payload.manifestHash
          || expectedResolutionHash !== prepared.payload.resolutionHash
        ) {
          throw new ImportHttpError(409, "Dry-run summary has changed");
        }
        const result = await dependencies.gateway.approve({ ...prepared, actorId: actor.userId });
        return json(200, {
          ...result,
          payloadHash: prepared.payloadHash,
          manifestHash: prepared.payload.manifestHash,
          resolutionHash: prepared.payload.resolutionHash,
        });
      }

      if (action === "apply") {
        const importBatchId = uuid(body.importBatchId, "importBatchId");
        const prepared = await prepareYezzaImport(body.payload);
        const result = await dependencies.gateway.apply({
          importBatchId,
          actorId: actor.userId,
          payloadHash: prepared.payloadHash,
          payload: prepared.payload,
        });
        if (result.status === "failed") {
          return json(409, {
            error: "Yezza import batch failed",
            errorCode: result.errorCode ?? "YEZZA_IMPORT_FAILED",
          });
        }
        return json(200, result);
      }

      throw new ImportHttpError(400, "Invalid action");
    } catch (error) {
      if (error instanceof ImportHttpError) return json(error.status, { error: error.safeMessage });
      console.error("[yezza-import] internal_error", error instanceof Error ? error.name : typeof error);
      return json(500, { error: "Internal error" });
    }
  };
}
