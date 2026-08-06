import { normalizeName } from "./matchPatients.ts";
import { parseServiceLines, type YezzaTransaction } from "./transformTransactions.ts";

export interface YezzaConsultation {
  sourceVisitId: string;
  sourcePatientId: string;
  visitAt: string;
  visitNote: string;
  diagnosisText: string;
  attendingDoctor: string;
  serviceText: string;
}

export interface TransformedQueueEntry {
  id: string;
  patient_id: string;
  assigned_doctor_id: string | null;
  clinic_status: "registered";
  visit_purpose: "consultation" | "legacy-financial-only";
  visit_notes: string | null;
  visit_remarks: string;
  created_at?: string;
}

export interface TransformedConsultation {
  id: string;
  queue_entry_id: string;
  patient_id: string;
  doctor_id: string | null;
  case_note: string;
  diagnosis_text: string;
  original_consulted_at: string;
  entry_source: "legacy_import";
  status: "in_progress";
}

export interface TransformedConsultationItem {
  consultation_id: string;
  item_name: string;
  quantity: 1;
  price: number;
  sourceLine: number;
  sourceVisitId: string;
}

export interface TransformVisitOptions {
  consultation?: YezzaConsultation;
  transaction?: YezzaTransaction;
  patientId: string;
  queueEntryId: string;
  consultationId?: string;
  doctorIdsByNormalizedName?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
}

export interface TransformVisitResult {
  sourceVisitId: string;
  queueEntry: TransformedQueueEntry;
  consultation: TransformedConsultation | null;
  items: TransformedConsultationItem[];
  unresolvedDoctor: string | null;
  orphanFinancialOnly: boolean;
}

function doctorIdFor(
  doctor: string,
  source: NonNullable<TransformVisitOptions["doctorIdsByNormalizedName"]>,
): string | null {
  const normalized = normalizeName(doctor);
  if (!normalized) return null;
  if (source instanceof Map) return source.get(normalized) ?? null;
  return source[normalized] ?? null;
}

function trace(...entries: Array<[string, string | boolean]>): string {
  return entries.map(([key, value]) => `${key}=${String(value)}`).join("; ");
}

/**
 * Produces payloads only. Database writes, source identity inserts, stock
 * movement, and clinical completion are intentionally deferred to the guarded
 * import job. The caller supplies generated database IDs so all rows remain
 * explicitly linked to their source visit and their parent payloads.
 */
export function transformVisit(options: TransformVisitOptions): TransformVisitResult {
  const { consultation, transaction, patientId, queueEntryId, consultationId, doctorIdsByNormalizedName } = options;
  const sourceVisitId = consultation?.sourceVisitId ?? transaction?.sourceVisitId;
  if (!sourceVisitId) throw new Error("A Yezza consultation or transaction with sourceVisitId is required.");

  if (!consultation) {
    return {
      sourceVisitId,
      orphanFinancialOnly: true,
      unresolvedDoctor: null,
      queueEntry: {
        id: queueEntryId,
        patient_id: patientId,
        assigned_doctor_id: null,
        clinic_status: "registered",
        visit_purpose: "legacy-financial-only",
        visit_notes: null,
        visit_remarks: trace(
          ["source_system", "yezza"],
          ["source_visit_id", sourceVisitId],
          ["source_bill_id", transaction?.billNumber ?? ""],
          ["legacy_financial_only", true],
          ["clinical_activity_excluded", true],
        ),
      },
      consultation: null,
      items: [],
    };
  }

  if (!consultationId) throw new Error("consultationId is required for a Yezza consultation payload.");
  const doctorId = doctorIdFor(consultation.attendingDoctor, doctorIdsByNormalizedName ?? {});
  const unresolvedDoctor = consultation.attendingDoctor.trim() && !doctorId ? consultation.attendingDoctor.trim() : null;
  const queueEntry: TransformedQueueEntry = {
    id: queueEntryId,
    patient_id: patientId,
    assigned_doctor_id: doctorId,
    clinic_status: "registered",
    visit_purpose: "consultation",
    visit_notes: consultation.visitNote || null,
    visit_remarks: trace(["source_system", "yezza"], ["source_visit_id", sourceVisitId], ["source_patient_id", consultation.sourcePatientId]),
    created_at: consultation.visitAt,
  };
  const transformedConsultation: TransformedConsultation = {
    id: consultationId,
    queue_entry_id: queueEntryId,
    patient_id: patientId,
    doctor_id: doctorId,
    case_note: `${consultation.visitNote}${consultation.visitNote ? "\n\n" : ""}${trace(["source_system", "yezza"], ["source_visit_id", sourceVisitId])}`,
    diagnosis_text: consultation.diagnosisText,
    original_consulted_at: consultation.visitAt,
    entry_source: "legacy_import",
    status: "in_progress",
  };

  return {
    sourceVisitId,
    queueEntry,
    consultation: transformedConsultation,
    items: parseServiceLines(consultation.serviceText).map((item) => ({
      consultation_id: consultationId,
      item_name: item.name,
      quantity: item.quantity,
      price: item.amount,
      sourceLine: item.sourceLine,
      sourceVisitId,
    })),
    unresolvedDoctor,
    orphanFinancialOnly: false,
  };
}
