import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeName, normalizeNationalId } from "./matchPatients.ts";
import { streamCsvRows, valueFor, type CsvRow } from "./streamCsv.ts";
import {
  YEZZA_EXPECTED_RECONCILIATION,
  matchesExpectedYezzaReconciliation,
  parseServiceLines,
  transactionFingerprint,
  type YezzaTransaction,
} from "./transformTransactions.ts";

const REQUIRED_FILES = ["patients.csv", "consultations.csv", "transactions_1.csv", "transactions_2.csv"] as const;
const MAX_ROWS = 2_000;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PatientResolution = {
  action: "create" | "reuse";
  existingPatientId?: string;
  reviewed: true;
  reviewRequired?: boolean;
  confirmedDuplicateIdentifier?: boolean;
};

type DoctorResolution = {
  action: "assign" | "unassigned";
  doctorId?: string;
  reviewed: true;
};

export interface YezzaResolutionFile {
  version: 1;
  sourceBatchId: string;
  patients: Record<string, PatientResolution>;
  doctors: Record<string, DoctorResolution>;
}

export interface PreparedBatchManifest {
  index: number;
  phase: "patients" | "visits";
  sourceBatchId: string;
  filename: string;
  payloadHash: string;
  bytes: number;
  counts: {
    patients: number;
    visits: number;
    consultations: number;
    consultationItems: number;
    transactions: number;
    payments: number;
  };
}

export interface PreparedManifest {
  formatVersion: 1;
  sourceBatchId: string;
  manifestHash: string;
  resolutionHash: string;
  sourceFiles: Array<{ filename: string; bytes: number; sha256: string; rows: number }>;
  reconciliation: {
    inputRows: number;
    duplicateRowsRemoved: number;
    uniqueBills: number;
    sourceTotal: number;
    paidTotal: number;
    matchesExpectedBaseline: boolean;
  };
  reviewCounts: {
    patientReview: number;
    unresolvedDoctors: number;
    orphanFinancialVisits: number;
  };
  batches: PreparedBatchManifest[];
  artifactHash: string;
}

type PreparedPatient = {
  sourcePatientId: string;
  existingPatientId?: string;
  patient?: Record<string, string | null>;
  reviewLocator?: string;
};

type PreparedVisit = {
  sourceVisitId: string;
  sourcePatientId: string;
  doctorReviewKey?: string;
  queueEntry: Record<string, unknown>;
  consultation: Record<string, unknown> | null;
  items: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
};

type DraftBatch = {
  phase: "patients" | "visits";
  patients: PreparedPatient[];
  visits: PreparedVisit[];
};

type TransactionSource = {
  sourcePatientId: string;
  visitAt: string | null;
  transaction: YezzaTransaction;
};

export type PrepareYezzaOptions = {
  inputDirectory: string;
  decisionsPath: string;
  outputDirectory: string;
  allowNonProductionReconciliation?: boolean;
};

export type RunPreparedOptions = {
  mode: "dry-run" | "approve" | "apply" | "retry";
  manifestPath: string;
  endpoint: string;
  accessToken: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
  ).join(",")}}`;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function patientIdentityFromRow(row: CsvRow): {
  nationalId: string | null;
  passportNo: string | null;
} {
  const explicitNationalId = nullable(valueFor(row, ["IC", "NRIC", "National ID"]));
  const explicitPassport = nullable(valueFor(row, ["Passport No", "Passport Number", "Passport"]));
  const combined = nullable(valueFor(row, ["IC/Passport", "IC Passport"]));
  if (explicitNationalId || explicitPassport) {
    return { nationalId: explicitNationalId, passportNo: explicitPassport };
  }
  if (!combined) return { nationalId: null, passportNo: null };
  const compact = combined.replace(/[\s-]+/g, "");
  return /^\d{12}$/.test(compact)
    ? { nationalId: compact, passportNo: null }
    : { nationalId: null, passportNo: combined };
}

function patientAddressFromRow(row: CsvRow): string | null {
  const generic = nullable(valueFor(row, ["Address", "Full Address"]));
  if (generic) return generic;
  const parts = [
    valueFor(row, ["address_1", "Address Line 1"]),
    valueFor(row, ["address_2", "Address Line 2"]),
    valueFor(row, ["city", "City"]),
    valueFor(row, ["postcode", "Postcode"]),
    valueFor(row, ["state", "State"]),
  ].map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function money(value: string, field: string): number {
  const normalized = value.trim().replace(/^RM\s*/i, "").replace(/,/g, "");
  const amount = Number(normalized);
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || Math.abs(rounded - amount) > 1e-9) throw new Error(`Invalid ${field}`);
  return rounded;
}

function paymentMethod(value: string): "cash" | "card" | "bank_transfer" | "e_wallet" | "panel" | "other" {
  const normalized = value.trim().toLowerCase();
  if (/[,/;+&]/.test(normalized)) return "other";
  if (normalized === "cash") return "cash";
  if (["card", "credit card", "debit card"].includes(normalized)) return "card";
  if (["bank transfer", "transfer", "duitnow"].includes(normalized)) return "bank_transfer";
  if (["e-wallet", "ewallet", "touch n go"].includes(normalized)) return "e_wallet";
  if (normalized.includes("panel") || normalized === "pmcare") return "panel";
  return "other";
}

function transactionFromRow(row: CsvRow): TransactionSource {
  return {
    sourcePatientId: valueFor(row, ["PatientID", "Patient ID", "Patient Id"]),
    visitAt: nullable(valueFor(row, ["Visit Date", "Visit At", "Date"])),
    transaction: {
      sourceVisitId: valueFor(row, ["Visit ID", "VisitID"]),
      billNumber: valueFor(row, ["Bill#", "Bill #", "Bill Number", "Bill No"]),
      totalAmount: valueFor(row, ["Total (RM)", "Total"]),
      paidAmount: valueFor(row, ["Paid Amount (RM)", "Paid Amount"]),
      method: valueFor(row, ["Payment Method", "Method"]),
      channel: valueFor(row, ["Payment Channel", "Channel"]),
      status: valueFor(row, ["Status"]),
    },
  };
}

function preparedTransaction(source: TransactionSource): Record<string, unknown> {
  const row = source.transaction;
  const amount = money(String(row.totalAmount), "transaction total");
  const paidAmount = money(String(row.paidAmount), "transaction paid amount");
  if (!row.billNumber) throw new Error(`Transaction ${row.sourceVisitId || "(missing visit)"} has no source bill ID`);
  return {
    sourceBillId: row.billNumber,
    amount,
    paidAmount,
    paymentMethod: paymentMethod(row.method),
    paymentType: "self_pay",
    notes: [
      "Yezza legacy payment",
      `source_bill_id=${row.billNumber}`,
      `source_visit_id=${row.sourceVisitId}`,
      `method=${row.method.trim() || "(blank)"}`,
      `channel=${row.channel.trim() || "(blank)"}`,
      `status=${row.status.trim() || "(blank)"}`,
    ].join("; "),
  };
}

function countsFor(batch: DraftBatch): PreparedBatchManifest["counts"] {
  return {
    patients: batch.patients.length,
    visits: batch.visits.length,
    consultations: batch.visits.filter((visit) => visit.consultation !== null).length,
    consultationItems: batch.visits.reduce((total, visit) => total + visit.items.length, 0),
    transactions: batch.visits.reduce((total, visit) => total + visit.transactions.length, 0),
    payments: batch.visits.reduce((total, visit) => total + visit.transactions.filter((transaction) => Number(transaction.paidAmount) > 0).length, 0),
  };
}

function validateResolutionFile(value: unknown): YezzaResolutionFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid resolution file");
  const result = value as Partial<YezzaResolutionFile>;
  if (result.version !== 1 || typeof result.sourceBatchId !== "string" || !result.sourceBatchId.trim()) throw new Error("Invalid resolution file identity");
  if (!result.patients || typeof result.patients !== "object" || !result.doctors || typeof result.doctors !== "object") throw new Error("Invalid resolution collections");
  return result as YezzaResolutionFile;
}

function patientFromRow(row: CsvRow, locator: string, resolution: PatientResolution, reviewRequired: boolean): PreparedPatient {
  const sourcePatientId = valueFor(row, ["PatientID", "Patient ID", "Patient Id", "ID"]);
  if (!sourcePatientId) throw new Error(`${locator} has no source patient ID`);
  if (resolution.reviewed !== true) throw new Error(`${locator} has not been explicitly reviewed`);
  if (resolution.action === "reuse") {
    if (!resolution.existingPatientId || !UUID_PATTERN.test(resolution.existingPatientId)) throw new Error(`${locator} has an invalid existing patient decision`);
    return { sourcePatientId, existingPatientId: resolution.existingPatientId, ...(reviewRequired ? { reviewLocator: locator } : {}) };
  }
  if (resolution.action !== "create") throw new Error(`${locator} has an invalid patient decision`);
  const identity = patientIdentityFromRow(row);
  return {
    sourcePatientId,
    patient: {
      name: valueFor(row, ["Patient Name", "Name"]),
      phone: nullable(valueFor(row, ["Phone", "Phone No", "Mobile", "Contact No"])),
      email: nullable(valueFor(row, ["Email"])),
      nationalId: identity.nationalId,
      passportNo: identity.passportNo,
      address: patientAddressFromRow(row),
      regNo: nullable(valueFor(row, ["Reg No", "Registration No", "Registration Number"])),
      dateOfBirth: nullable(valueFor(row, ["DOB", "Date Of Birth", "Birth Date"])),
      gender: nullable(valueFor(row, ["Gender"])),
      stateOfBirth: nullable(valueFor(row, ["State Of Birth", "Birth State"])),
      allergies: nullable(valueFor(row, ["Allergies"])),
      underlyingConditions: nullable(valueFor(row, ["Underlying Conditions", "Medical Conditions"])),
      registrationDate: nullable(valueFor(row, ["Registration Date", "Registered At", "Created Date"])),
      notes: nullable(valueFor(row, ["Notes"])),
    },
    ...(reviewRequired ? { reviewLocator: locator } : {}),
  };
}

function doctorResolutionFor(name: string, resolutions: YezzaResolutionFile, used: Set<string>): { doctorId: string | null; reviewKey?: string } {
  const normalized = normalizeName(name);
  if (!normalized) return { doctorId: null };
  const resolution = resolutions.doctors[normalized];
  if (!resolution || resolution.reviewed !== true) throw new Error(`Doctor decision is required for ${normalized}`);
  used.add(normalized);
  if (resolution.action === "assign") {
    if (!resolution.doctorId || !UUID_PATTERN.test(resolution.doctorId)) throw new Error(`Invalid doctor assignment for ${normalized}`);
    return { doctorId: resolution.doctorId };
  }
  if (resolution.action !== "unassigned") throw new Error(`Invalid doctor decision for ${normalized}`);
  return { doctorId: null, reviewKey: `doctor-${sha256Text(normalized).slice(0, 16)}` };
}

function preparedVisit(
  row: CsvRow,
  patient: PreparedPatient,
  transactionSources: TransactionSource[],
  resolutions: YezzaResolutionFile,
  usedDoctors: Set<string>,
): PreparedVisit {
  const sourceVisitId = valueFor(row, ["Visit ID", "VisitID"]);
  const sourcePatientId = valueFor(row, ["PatientID", "Patient ID", "Patient Id"]);
  const visitAt = valueFor(row, ["Visit Date", "Visit At", "Date"]);
  if (!sourceVisitId || !sourcePatientId || !visitAt) throw new Error("Consultation row is missing a visit, patient, or date");
  if (patient.sourcePatientId !== sourcePatientId) throw new Error(`Visit ${sourceVisitId} has an invalid patient mapping`);
  const note = valueFor(row, ["Visit Note", "Notes", "Case Note"]);
  const doctor = doctorResolutionFor(valueFor(row, ["Attending Dr", "Attending Doctor", "Doctor", "Dr"]), resolutions, usedDoctors);
  const items = parseServiceLines(valueFor(row, ["Service Name", "Services", "Service"]));
  if (items.length > MAX_ROWS || transactionSources.length > MAX_ROWS) throw new Error(`Visit ${sourceVisitId} exceeds the 2,000-row nested array limit`);
  return {
    sourceVisitId,
    sourcePatientId,
    ...(doctor.reviewKey ? { doctorReviewKey: doctor.reviewKey } : {}),
    queueEntry: {
      clinicStatus: "registered",
      assignedDoctorId: doctor.doctorId,
      visitPurpose: "consultation",
      visitNotes: note || null,
      visitRemarks: `source_system=yezza; source_visit_id=${sourceVisitId}; source_patient_id=${sourcePatientId}`,
      paymentMethod: null,
      isUrgent: false,
      createdAt: visitAt,
    },
    consultation: {
      doctorId: doctor.doctorId,
      caseNote: `${note}${note ? "\n\n" : ""}source_system=yezza; source_visit_id=${sourceVisitId}`,
      diagnosisText: valueFor(row, ["Diagnoses", "Diagnosis"]),
      originalConsultedAt: visitAt,
    },
    items: items.map((item) => ({ sourceLine: item.sourceLine, itemName: item.name, quantity: 1, price: item.amount })),
    transactions: transactionSources.map(preparedTransaction),
  };
}

function orphanVisit(sourceVisitId: string, sources: TransactionSource[], patient: PreparedPatient): PreparedVisit {
  if (!sourceVisitId || !patient || sources.length === 0) throw new Error(`Invalid orphan financial visit ${sourceVisitId}`);
  if (sources.length > MAX_ROWS) throw new Error(`Visit ${sourceVisitId} exceeds the 2,000-row transaction limit`);
  return {
    sourceVisitId,
    sourcePatientId: patient.sourcePatientId,
    queueEntry: {
      clinicStatus: "registered",
      assignedDoctorId: null,
      visitPurpose: "legacy-financial-only",
      visitNotes: null,
      visitRemarks: `source_system=yezza; source_visit_id=${sourceVisitId}; legacy_financial_only=true; clinical_activity_excluded=true`,
      paymentMethod: null,
      isUrgent: false,
      createdAt: sources[0].visitAt,
    },
    consultation: null,
    items: [],
    transactions: sources.map(preparedTransaction),
  };
}

export async function prepareYezzaBatchFiles(options: PrepareYezzaOptions): Promise<PreparedManifest> {
  const inputDirectory = resolve(options.inputDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const decisionsPath = resolve(options.decisionsPath);
  const resolutionBytes = await readFile(decisionsPath, "utf8");
  const resolutions = validateResolutionFile(JSON.parse(resolutionBytes));
  const resolutionHash = sha256Text(resolutionBytes);
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

  const paths = Object.fromEntries(REQUIRED_FILES.map((filename) => [filename, join(inputDirectory, filename)])) as Record<typeof REQUIRED_FILES[number], string>;
  const identifierCounts = new Map<string, number>();
  let patientRows = 0;
  for await (const { row } of streamCsvRows(paths["patients.csv"])) {
    patientRows += 1;
    const identifier = normalizeNationalId(valueFor(row, ["IC/Passport", "IC Passport", "IC", "NRIC", "National ID"]));
    if (identifier) identifierCounts.set(identifier, (identifierCounts.get(identifier) ?? 0) + 1);
  }

  const patientsBySourceId = new Map<string, PreparedPatient>();
  const usedPatientDecisions = new Set<string>();
  const drafts: Array<{ path: string; phase: DraftBatch["phase"] }> = [];
  let draftIndex = 0;
  const writeDraft = async (batch: DraftBatch): Promise<void> => {
    if (batch.patients.length === 0 && batch.visits.length === 0) return;
    const path = join(outputDirectory, `.draft-${String(++draftIndex).padStart(4, "0")}.json`);
    await writeFile(path, JSON.stringify(batch), { encoding: "utf8", mode: 0o600 });
    drafts.push({ path, phase: batch.phase });
  };

  let patientBatch: PreparedPatient[] = [];
  let patientReview = 0;
  for await (const { row, locatorIndex } of streamCsvRows(paths["patients.csv"])) {
    const locator = `patients.csv:${locatorIndex}`;
    const resolution = resolutions.patients[locator];
    if (!resolution) throw new Error(`Patient decision is required for ${locator}`);
    usedPatientDecisions.add(locator);
    const identifier = normalizeNationalId(valueFor(row, ["IC/Passport", "IC Passport", "IC", "NRIC", "National ID"]));
    const duplicate = Boolean(identifier && (identifierCounts.get(identifier) ?? 0) > 1);
    if (duplicate && resolution.confirmedDuplicateIdentifier !== true) throw new Error(`${locator} must confirm duplicate source identifier review`);
    const reviewRequired = duplicate || resolution.reviewRequired === true;
    if (reviewRequired) patientReview += 1;
    const patient = patientFromRow(row, locator, resolution, reviewRequired);
    if (patientsBySourceId.has(patient.sourcePatientId)) throw new Error(`Duplicate source patient ID ${patient.sourcePatientId}`);
    patientsBySourceId.set(patient.sourcePatientId, patient);
    patientBatch.push(patient);
    if (patientBatch.length === MAX_ROWS) {
      await writeDraft({ phase: "patients", patients: patientBatch, visits: [] });
      patientBatch = [];
    }
  }
  await writeDraft({ phase: "patients", patients: patientBatch, visits: [] });
  const unusedPatientDecision = Object.keys(resolutions.patients).find((locator) => !usedPatientDecisions.has(locator));
  if (unusedPatientDecision) throw new Error(`Unused patient decision ${unusedPatientDecision}`);

  const transactionsByVisit = new Map<string, TransactionSource[]>();
  const seenTransactions = new Set<string>();
  const billFingerprints = new Map<string, string>();
  const transactionRowsByFile = new Map<string, number>();
  let transactionInputRows = 0;
  let duplicateRowsRemoved = 0;
  let sourceTotalSen = 0;
  let paidTotalSen = 0;
  for (const filename of ["transactions_1.csv", "transactions_2.csv"] as const) {
    let rows = 0;
    for await (const { row } of streamCsvRows(paths[filename])) {
      rows += 1;
      transactionInputRows += 1;
      const source = transactionFromRow(row);
      const fingerprint = transactionFingerprint(source.transaction);
      if (seenTransactions.has(fingerprint)) {
        duplicateRowsRemoved += 1;
        continue;
      }
      seenTransactions.add(fingerprint);
      if (!source.transaction.sourceVisitId) throw new Error(`${filename} has a transaction without a source visit ID`);
      const priorBill = billFingerprints.get(source.transaction.billNumber);
      if (priorBill && priorBill !== fingerprint) throw new Error(`Conflicting duplicate source bill ${source.transaction.billNumber}`);
      billFingerprints.set(source.transaction.billNumber, fingerprint);
      sourceTotalSen += Math.round(money(String(source.transaction.totalAmount), "transaction total") * 100);
      paidTotalSen += Math.round(money(String(source.transaction.paidAmount), "transaction paid amount") * 100);
      const group = transactionsByVisit.get(source.transaction.sourceVisitId) ?? [];
      group.push(source);
      transactionsByVisit.set(source.transaction.sourceVisitId, group);
    }
    transactionRowsByFile.set(filename, rows);
  }
  const reconciliation = {
    inputRows: transactionInputRows,
    duplicateRowsRemoved,
    uniqueBills: seenTransactions.size,
    sourceTotal: sourceTotalSen / 100,
    paidTotal: paidTotalSen / 100,
    matchesExpectedBaseline: matchesExpectedYezzaReconciliation({ uniqueBills: seenTransactions.size, sourceTotal: sourceTotalSen / 100, paidTotal: paidTotalSen / 100 }),
  };
  if (!reconciliation.matchesExpectedBaseline && !options.allowNonProductionReconciliation) {
    throw new Error(`Source reconciliation does not match the approved ${YEZZA_EXPECTED_RECONCILIATION.uniqueBills}-bill baseline`);
  }

  const usedDoctors = new Set<string>();
  const seenConsultationVisits = new Set<string>();
  let consultationRows = 0;
  let orphanFinancialVisits = 0;
  let visitBatchVisits: PreparedVisit[] = [];
  let visitBatchPatients = new Map<string, PreparedPatient>();
  const flushVisits = async (): Promise<void> => {
    await writeDraft({ phase: "visits", patients: [...visitBatchPatients.values()], visits: visitBatchVisits });
    visitBatchVisits = [];
    visitBatchPatients = new Map();
  };
  const addVisit = async (visit: PreparedVisit): Promise<void> => {
    const patient = patientsBySourceId.get(visit.sourcePatientId);
    if (!patient) throw new Error(`Visit ${visit.sourceVisitId} references absent source patient ${visit.sourcePatientId}`);
    const addsPatient = !visitBatchPatients.has(patient.sourcePatientId);
    const candidate: DraftBatch = {
      phase: "visits",
      patients: addsPatient ? [...visitBatchPatients.values(), patient] : [...visitBatchPatients.values()],
      visits: [...visitBatchVisits, visit],
    };
    const candidateBytes = Buffer.byteLength(JSON.stringify(candidate), "utf8");
    if (visitBatchVisits.length > 0 && (candidate.visits.length > MAX_ROWS || candidate.patients.length > MAX_ROWS || candidateBytes > MAX_PAYLOAD_BYTES - 64_000)) {
      await flushVisits();
    }
    if (Buffer.byteLength(JSON.stringify({ phase: "visits", patients: [patient], visits: [visit] }), "utf8") > MAX_PAYLOAD_BYTES - 64_000) {
      throw new Error(`Visit ${visit.sourceVisitId} cannot fit in a bounded import payload`);
    }
    visitBatchPatients.set(patient.sourcePatientId, patient);
    visitBatchVisits.push(visit);
  };

  for await (const { row } of streamCsvRows(paths["consultations.csv"])) {
    consultationRows += 1;
    const sourceVisitId = valueFor(row, ["Visit ID", "VisitID"]);
    if (!sourceVisitId || seenConsultationVisits.has(sourceVisitId)) throw new Error(`Duplicate or missing consultation source visit ${sourceVisitId}`);
    seenConsultationVisits.add(sourceVisitId);
    const sourcePatientId = valueFor(row, ["PatientID", "Patient ID", "Patient Id"]);
    const patient = patientsBySourceId.get(sourcePatientId);
    if (!patient) throw new Error(`Consultation ${sourceVisitId} references absent source patient ${sourcePatientId}`);
    const transactions = transactionsByVisit.get(sourceVisitId) ?? [];
    await addVisit(preparedVisit(row, patient, transactions, resolutions, usedDoctors));
    transactionsByVisit.delete(sourceVisitId);
  }
  for (const sourceVisitId of [...transactionsByVisit.keys()].sort()) {
    const sources = transactionsByVisit.get(sourceVisitId)!;
    const patientIds = new Set(sources.map((source) => source.sourcePatientId));
    if (patientIds.size !== 1 || ![...patientIds][0]) throw new Error(`Orphan financial visit ${sourceVisitId} has no unambiguous source patient`);
    const patient = patientsBySourceId.get([...patientIds][0]);
    if (!patient) throw new Error(`Orphan financial visit ${sourceVisitId} references an absent source patient`);
    orphanFinancialVisits += 1;
    await addVisit(orphanVisit(sourceVisitId, sources, patient));
  }
  await flushVisits();
  const unusedDoctorDecision = Object.keys(resolutions.doctors).find((name) => !usedDoctors.has(name));
  if (unusedDoctorDecision) throw new Error(`Unused doctor decision ${unusedDoctorDecision}`);

  const unresolvedDoctors = [...usedDoctors].filter((name) => resolutions.doctors[name].action === "unassigned").length;
  const rowCounts: Record<string, number> = {
    "patients.csv": patientRows,
    "consultations.csv": consultationRows,
    "transactions_1.csv": transactionRowsByFile.get("transactions_1.csv") ?? 0,
    "transactions_2.csv": transactionRowsByFile.get("transactions_2.csv") ?? 0,
  };
  const sourceFiles = await Promise.all(REQUIRED_FILES.map(async (filename) => ({
    filename,
    bytes: (await stat(paths[filename])).size,
    sha256: await sha256File(paths[filename]),
    rows: rowCounts[filename],
  })));
  const reviewCounts = { patientReview, unresolvedDoctors, orphanFinancialVisits };
  const manifestIdentity = {
    formatVersion: 1,
    sourceBatchId: resolutions.sourceBatchId,
    resolutionHash,
    sourceFiles,
    reconciliation,
    reviewCounts,
  };
  const manifestHash = sha256Text(canonicalJson(manifestIdentity));

  const batches: PreparedBatchManifest[] = [];
  for (const [zeroIndex, draft] of drafts.entries()) {
    const batch = JSON.parse(await readFile(draft.path, "utf8")) as DraftBatch;
    const index = zeroIndex + 1;
    const sourceBatchId = `${resolutions.sourceBatchId}-${String(index).padStart(4, "0")}-of-${String(drafts.length).padStart(4, "0")}`;
    const payload = {
      sourceBatchId,
      manifestHash,
      resolutionHash,
      batchIndex: index,
      batchCount: drafts.length,
      reviewCounts: {
        patientReview: new Set(batch.patients.flatMap((patient) => patient.reviewLocator ? [patient.reviewLocator] : [])).size,
        unresolvedDoctors: new Set(batch.visits.flatMap((visit) => visit.doctorReviewKey ? [visit.doctorReviewKey] : [])).size,
        orphanFinancialVisits: batch.visits.filter((visit) => visit.queueEntry.visitPurpose === "legacy-financial-only").length,
      },
      patients: batch.patients,
      visits: batch.visits,
    };
    const payloadContent = `${JSON.stringify(payload, null, 2)}\n`;
    const bytes = Buffer.byteLength(payloadContent, "utf8");
    if (bytes > MAX_PAYLOAD_BYTES) throw new Error(`Prepared payload ${index} exceeds the 8 MiB request limit`);
    const payloadHash = sha256Text(canonicalJson(payload));
    const filename = `batch-${String(index).padStart(4, "0")}.json`;
    await writeFile(join(outputDirectory, filename), payloadContent, { encoding: "utf8", mode: 0o600 });
    batches.push({ index, phase: draft.phase, sourceBatchId, filename, payloadHash, bytes, counts: countsFor(batch) });
    await rm(draft.path, { force: true });
  }

  const manifestWithoutArtifactHash = { ...manifestIdentity, manifestHash, batches };
  const artifactHash = sha256Text(canonicalJson(manifestWithoutArtifactHash));
  const manifest: PreparedManifest = { ...manifestWithoutArtifactHash, artifactHash };
  await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return manifest;
}

async function loadVerifiedManifest(manifestPath: string): Promise<{ manifest: PreparedManifest; directory: string }> {
  const absolute = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absolute, "utf8")) as PreparedManifest;
  const { artifactHash, ...withoutArtifactHash } = manifest;
  if (artifactHash !== sha256Text(canonicalJson(withoutArtifactHash))) throw new Error("Prepared manifest artifact hash mismatch");
  return { manifest, directory: dirname(absolute) };
}

async function postJson(options: RunPreparedOptions, action: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await (options.fetchImpl ?? fetch)(`${options.endpoint}?action=${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.apiKey ? { apikey: options.apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Yezza ${action} request failed`);
  return result;
}

export async function runPreparedYezzaImport(options: RunPreparedOptions): Promise<void> {
  if (!options.accessToken) throw new Error("An authenticated operator access token is required");
  const { manifest, directory } = await loadVerifiedManifest(options.manifestPath);
  const payloads = await Promise.all(manifest.batches.map(async (batch) => {
    const payload = JSON.parse(await readFile(join(directory, batch.filename), "utf8")) as Record<string, unknown>;
    if (sha256Text(canonicalJson(payload)) !== batch.payloadHash) throw new Error(`Payload hash mismatch for ${batch.filename}`);
    if (payload.manifestHash !== manifest.manifestHash || payload.resolutionHash !== manifest.resolutionHash) throw new Error(`Manifest binding mismatch for ${batch.filename}`);
    return { batch, payload };
  }));
  const statePath = join(directory, "import-state.json");

  if (options.mode === "dry-run") {
    for (const { batch, payload } of payloads) {
      const result = await postJson(options, "dry-run", payload);
      if (result.payloadHash !== batch.payloadHash || result.manifestHash !== manifest.manifestHash || result.resolutionHash !== manifest.resolutionHash) {
        throw new Error(`Server dry-run does not match ${batch.filename}`);
      }
    }
    return;
  }

  if (options.mode === "approve") {
    const approvals: Array<{ index: number; importBatchId: string; payloadHash: string }> = [];
    for (const { batch, payload } of payloads) {
      const dryRun = await postJson(options, "dry-run", payload);
      if (dryRun.payloadHash !== batch.payloadHash || dryRun.manifestHash !== manifest.manifestHash || dryRun.resolutionHash !== manifest.resolutionHash) {
        throw new Error(`Server dry-run does not match ${batch.filename}`);
      }
      const approval = await postJson(options, "approve", {
        payload,
        expectedPayloadHash: batch.payloadHash,
        expectedManifestHash: manifest.manifestHash,
        expectedResolutionHash: manifest.resolutionHash,
      });
      if (approval.status !== "approved" || typeof approval.importBatchId !== "string") throw new Error(`Invalid approval for ${batch.filename}`);
      approvals.push({ index: batch.index, importBatchId: approval.importBatchId, payloadHash: batch.payloadHash });
    }
    await writeFile(statePath, `${JSON.stringify({ formatVersion: 1, manifestHash: manifest.manifestHash, artifactHash: manifest.artifactHash, approvals }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    return;
  }

  const state = JSON.parse(await readFile(statePath, "utf8")) as { manifestHash: string; artifactHash: string; approvals: Array<{ index: number; importBatchId: string; payloadHash: string }> };
  if (state.manifestHash !== manifest.manifestHash || state.artifactHash !== manifest.artifactHash) throw new Error("Approval state does not match the prepared manifest");
  for (const { batch, payload } of payloads) {
    const approval = state.approvals.find((candidate) => candidate.index === batch.index && candidate.payloadHash === batch.payloadHash);
    if (!approval) throw new Error(`Approved batch state is missing for ${batch.filename}`);
    const dryRun = await postJson(options, "dry-run", payload);
    if (dryRun.payloadHash !== batch.payloadHash || dryRun.manifestHash !== manifest.manifestHash || dryRun.resolutionHash !== manifest.resolutionHash) {
      throw new Error(`Server dry-run does not match ${batch.filename}`);
    }
    const applied = await postJson(options, "apply", { importBatchId: approval.importBatchId, payload });
    if (applied.status !== "completed") throw new Error(`Apply did not complete for ${batch.filename}`);
  }
}

function commandArguments(argumentsList: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) throw new Error("Invalid Yezza batch command arguments");
    values.set(key, value);
  }
  return values;
}

async function main(argumentsList: string[]): Promise<void> {
  const values = commandArguments(argumentsList);
  const mode = values.get("--mode") ?? "prepare";
  if (mode === "prepare") {
    const inputDirectory = values.get("--input-dir");
    const decisionsPath = values.get("--resolutions");
    const outputDirectory = values.get("--output-dir") ?? "yezza-prepared-import";
    if (!inputDirectory || !decisionsPath) throw new Error("Prepare requires --input-dir and --resolutions");
    const manifest = await prepareYezzaBatchFiles({
      inputDirectory,
      decisionsPath,
      outputDirectory,
      allowNonProductionReconciliation: values.get("--allow-non-production-reconciliation") === "true",
    });
    console.log(JSON.stringify({ manifest: join(resolve(outputDirectory), "manifest.json"), manifestHash: manifest.manifestHash, artifactHash: manifest.artifactHash, batches: manifest.batches.length }, null, 2));
    return;
  }
  if (!["dry-run", "approve", "apply", "retry"].includes(mode)) throw new Error("Invalid --mode");
  const manifestPath = values.get("--manifest");
  const endpoint = values.get("--endpoint");
  const accessToken = process.env.YEZZA_IMPORT_ACCESS_TOKEN;
  if (!manifestPath || !endpoint || !accessToken) throw new Error("Run modes require --manifest, --endpoint, and YEZZA_IMPORT_ACCESS_TOKEN");
  await runPreparedYezzaImport({
    mode: mode as RunPreparedOptions["mode"],
    manifestPath,
    endpoint,
    accessToken,
    apiKey: process.env.YEZZA_IMPORT_API_KEY,
  });
  console.log(`Yezza ${mode} completed for ${basename(manifestPath)}.`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
