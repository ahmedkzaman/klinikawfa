export type InsightPerformanceConfidenceState = 'reliable' | 'partial' | 'insufficient';

export type InsightPerformanceClinic = {
  completedVisits: number;
  uniquePatients: number;
  rosteredHours: number;
  patientsPerHour: number | null;
  visitBilling: number;
  patientCollected: number;
  revenuePerHour: number | null;
  cogs: number | null;
  grossProfit: number | null;
  procedures: number;
  documents: number;
  selfPayVisits: number;
  panelVisits: number;
};

export type InsightPerformanceDoctor = {
  doctorId: string | null;
  doctorName: string;
  completedVisits: number;
  uniquePatients: number;
  rosteredHours: number;
  patientsPerHour: number | null;
  visitBilling: number;
  revenuePerHour: number | null;
  procedures: number;
  documents: number;
  missingAttribution: number;
};

export type InsightPerformanceService = {
  serviceId: string;
  serviceName: string;
  volume: number;
  uniquePatients: number;
  revenue: number;
  cogs: number | null;
  profit: number | null;
  marginPct: number | null;
  averagePrice: number | null;
  trendPct: number | null;
  doctorCount: number;
  missingCostCount: number;
};

export type InsightPerformanceQuality = {
  missingAttribution: number;
  missingCostCount: number;
  excludedVoidedPayments: number;
};

export type InsightPerformanceConfidence = {
  state: InsightPerformanceConfidenceState;
  missingAttribution: number;
  missingCostCount: number;
};

export type InsightPerformanceReport = {
  clinic: InsightPerformanceClinic;
  doctors: InsightPerformanceDoctor[];
  services: InsightPerformanceService[];
  quality: InsightPerformanceQuality;
  confidence: InsightPerformanceConfidence;
  generatedAt: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, field: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  const normalized = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof normalized !== 'number' || !Number.isFinite(normalized)) {
    throw new Error(`${field} must be a finite number`);
  }
  return normalized;
}

function nonNegativeNumber(value: unknown, field: string): number {
  const normalized = finiteNumber(value, field);
  if (normalized < 0) throw new Error(`${field} must not be negative`);
  return normalized;
}

function count(value: unknown, field: string): number {
  const normalized = nonNegativeNumber(value, field);
  if (!Number.isInteger(normalized)) throw new Error(`${field} must be an integer`);
  return normalized;
}

function nullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : finiteNumber(value, field);
}

function nullableId(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}

function normalizeClinic(raw: unknown): InsightPerformanceClinic {
  const row = record(raw, 'clinic');
  return {
    completedVisits: count(row.completed_visits, 'clinic.completed_visits'),
    uniquePatients: count(row.unique_patients, 'clinic.unique_patients'),
    rosteredHours: nonNegativeNumber(row.rostered_hours, 'clinic.rostered_hours'),
    patientsPerHour: nullableNumber(row.patients_per_hour, 'clinic.patients_per_hour'),
    visitBilling: finiteNumber(row.visit_billing, 'clinic.visit_billing'),
    patientCollected: finiteNumber(row.patient_collected, 'clinic.patient_collected'),
    revenuePerHour: nullableNumber(row.revenue_per_hour, 'clinic.revenue_per_hour'),
    cogs: nullableNumber(row.cogs, 'clinic.cogs'),
    grossProfit: nullableNumber(row.gross_profit, 'clinic.gross_profit'),
    procedures: nonNegativeNumber(row.procedures, 'clinic.procedures'),
    documents: count(row.documents, 'clinic.documents'),
    selfPayVisits: count(row.self_pay_visits, 'clinic.self_pay_visits'),
    panelVisits: count(row.panel_visits, 'clinic.panel_visits'),
  };
}

function normalizeDoctor(raw: unknown, index: number): InsightPerformanceDoctor {
  const field = `doctors[${index}]`;
  const row = record(raw, field);
  return {
    doctorId: nullableId(row.doctor_id, `${field}.doctor_id`),
    doctorName: text(row.doctor_name, `${field}.doctor_name`),
    completedVisits: count(row.completed_visits, `${field}.completed_visits`),
    uniquePatients: count(row.unique_patients, `${field}.unique_patients`),
    rosteredHours: nonNegativeNumber(row.rostered_hours, `${field}.rostered_hours`),
    patientsPerHour: nullableNumber(row.patients_per_hour, `${field}.patients_per_hour`),
    visitBilling: finiteNumber(row.visit_billing, `${field}.visit_billing`),
    revenuePerHour: nullableNumber(row.revenue_per_hour, `${field}.revenue_per_hour`),
    procedures: nonNegativeNumber(row.procedures, `${field}.procedures`),
    documents: count(row.documents, `${field}.documents`),
    missingAttribution: count(row.missing_attribution, `${field}.missing_attribution`),
  };
}

function normalizeService(raw: unknown, index: number): InsightPerformanceService {
  const field = `services[${index}]`;
  const row = record(raw, field);
  return {
    serviceId: text(row.service_id, `${field}.service_id`),
    serviceName: text(row.service_name, `${field}.service_name`),
    volume: nonNegativeNumber(row.volume, `${field}.volume`),
    uniquePatients: count(row.unique_patients, `${field}.unique_patients`),
    revenue: finiteNumber(row.revenue, `${field}.revenue`),
    cogs: nullableNumber(row.cogs, `${field}.cogs`),
    profit: nullableNumber(row.profit, `${field}.profit`),
    marginPct: nullableNumber(row.margin_pct, `${field}.margin_pct`),
    averagePrice: nullableNumber(row.average_price, `${field}.average_price`),
    trendPct: nullableNumber(row.trend_pct, `${field}.trend_pct`),
    doctorCount: count(row.doctor_count, `${field}.doctor_count`),
    missingCostCount: count(row.missing_cost_count, `${field}.missing_cost_count`),
  };
}

function normalizeQuality(raw: unknown): InsightPerformanceQuality {
  const row = record(raw, 'quality');
  return {
    missingAttribution: count(row.missing_attribution, 'quality.missing_attribution'),
    missingCostCount: count(row.missing_cost_count, 'quality.missing_cost_count'),
    excludedVoidedPayments: count(
      row.excluded_voided_payments,
      'quality.excluded_voided_payments',
    ),
  };
}

function normalizeConfidence(raw: unknown): InsightPerformanceConfidence {
  const row = record(raw, 'confidence');
  if (row.state !== 'reliable' && row.state !== 'partial' && row.state !== 'insufficient') {
    throw new Error('confidence.state is invalid');
  }
  return {
    state: row.state,
    missingAttribution: count(row.missing_attribution, 'confidence.missing_attribution'),
    missingCostCount: count(row.missing_cost_count, 'confidence.missing_cost_count'),
  };
}

export function normalizeInsightPerformanceReport(raw: unknown): InsightPerformanceReport {
  try {
    const report = record(raw, 'report');
    const generatedAt = text(report.generated_at, 'generated_at');
    if (Number.isNaN(Date.parse(generatedAt))) throw new Error('generated_at must be a timestamp');

    return {
      clinic: normalizeClinic(report.clinic),
      doctors: array(report.doctors, 'doctors').map(normalizeDoctor),
      services: array(report.services, 'services').map(normalizeService),
      quality: normalizeQuality(report.quality),
      confidence: normalizeConfidence(report.confidence),
      generatedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown payload error';
    throw new Error(`Invalid Insight performance report: ${reason}`);
  }
}
