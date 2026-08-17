export type DoctorPerformanceDetail = {
  kind: 'doctor'; doctorId: string;
  visitsByShift: Array<{ date: string; shift: 'S1' | 'S2' | 'S3'; visits: number }>;
  averageVisitDurationMinutes: number | null; durationMeasuredVisits: number;
  paymentMix: Array<{ paymentType: 'self_pay' | 'panel'; visits: number }>;
  financial: { revenue: number; cogs: number | null; grossProfit: number | null; marginPct: number | null; revenuePerVisit: number | null; revenuePerHour: number | null; missingCostCount: number };
  quality: { missingConsultationNotes: number; missingDiagnosis: number; missingDispenseNote: number; returnedOfflineConsultations: number; incompleteDoctorAttribution: number; billsCorrectedAfterCompletion: number };
  diagnoses: Array<{ name: string; visits: number }>;
  procedures: Array<{ name: string; quantity: number; charged: number; cogs: number | null; grossProfit: number | null }>;
  medicines: Array<{ name: string; quantity: number }>;
};

export type ServicePerformanceDetail = {
  kind: 'service'; serviceId: string; serviceName: string;
  trend: Array<{ date: string; volume: number; revenue: number }>;
  doctorContribution: Array<{ doctorId: string; doctorName: string; volume: number }>;
  paymentMix: Array<{ paymentType: 'self_pay' | 'panel'; visits: number }>;
  visits: Array<{ queueEntryId: string; queueSequence: number | null; visitDate: string; paymentType: 'self_pay' | 'panel'; quantity: number; unitPrice: number; totalPrice: number; cogs: number | null; grossProfit: number | null }>;
  currentCatalog: { price: number; cogs: number | null; grossProfit: number | null; marginPct: number | null } | null;
  marginHistory: Array<{ date: string; averagePrice: number; averageCogs: number | null; marginPct: number | null }>;
};

export type InsightPerformanceDetail = DoctorPerformanceDetail | ServicePerformanceDetail;
type Row = Record<string, unknown>;
const row = (value: unknown, name: string): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Row;
};
const list = (value: unknown, name: string) => {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
};
const text = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be text`);
  return value;
};
const number = (value: unknown, name: string) => {
  const result = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`${name} must be numeric`);
  return result;
};
const count = (value: unknown, name: string) => {
  const result = number(value, name);
  if (result < 0 || !Number.isInteger(result)) throw new Error(`${name} must be a count`);
  return result;
};
const nullable = (value: unknown, name: string) => value === null ? null : number(value, name);
const date = (value: unknown, name: string) => {
  const result = text(value, name);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== result) throw new Error(`${name} must be an ISO date`);
  return result;
};
const shift = (value: unknown): 'S1' | 'S2' | 'S3' => {
  if (value !== 'S1' && value !== 'S2' && value !== 'S3') throw new Error('shift is invalid');
  return value;
};
const payment = (value: unknown): 'self_pay' | 'panel' => {
  if (value !== 'self_pay' && value !== 'panel') throw new Error('payment_type is invalid');
  return value;
};

export function normalizeInsightPerformanceDetail(value: unknown): InsightPerformanceDetail {
  try {
    const source = row(value, 'detail');
    if (source.kind === 'doctor') {
      const financial = row(source.financial, 'financial');
      const quality = row(source.quality, 'quality');
      return {
        kind: 'doctor', doctorId: text(source.doctor_id, 'doctor_id'),
        visitsByShift: list(source.visits_by_shift, 'visits_by_shift').map((item) => { const v = row(item, 'shift'); return { date: date(v.date, 'date'), shift: shift(v.shift), visits: count(v.visits, 'visits') }; }),
        averageVisitDurationMinutes: nullable(source.average_visit_duration_minutes, 'average_visit_duration_minutes'),
        durationMeasuredVisits: count(source.duration_measured_visits, 'duration_measured_visits'),
        paymentMix: list(source.payment_mix, 'payment_mix').map((item) => { const v = row(item, 'payment'); return { paymentType: payment(v.payment_type), visits: count(v.visits, 'visits') }; }),
        financial: { revenue: number(financial.revenue, 'revenue'), cogs: nullable(financial.cogs, 'cogs'), grossProfit: nullable(financial.gross_profit, 'gross_profit'), marginPct: nullable(financial.margin_pct, 'margin_pct'), revenuePerVisit: nullable(financial.revenue_per_visit, 'revenue_per_visit'), revenuePerHour: nullable(financial.revenue_per_hour, 'revenue_per_hour'), missingCostCount: count(financial.missing_cost_count, 'missing_cost_count') },
        quality: { missingConsultationNotes: count(quality.missing_consultation_notes, 'missing_consultation_notes'), missingDiagnosis: count(quality.missing_diagnosis, 'missing_diagnosis'), missingDispenseNote: count(quality.missing_dispense_note, 'missing_dispense_note'), returnedOfflineConsultations: count(quality.returned_offline_consultations, 'returned_offline_consultations'), incompleteDoctorAttribution: count(quality.incomplete_doctor_attribution, 'incomplete_doctor_attribution'), billsCorrectedAfterCompletion: count(quality.bills_corrected_after_completion, 'bills_corrected_after_completion') },
        diagnoses: list(source.diagnoses, 'diagnoses').map((item) => { const v = row(item, 'diagnosis'); return { name: text(v.name, 'name'), visits: count(v.visits, 'visits') }; }),
        procedures: list(source.procedures, 'procedures').map((item) => { const v = row(item, 'procedure'); return { name: text(v.name, 'name'), quantity: number(v.quantity, 'quantity'), charged: number(v.charged, 'charged'), cogs: nullable(v.cogs, 'cogs'), grossProfit: nullable(v.gross_profit, 'gross_profit') }; }),
        medicines: list(source.medicines, 'medicines').map((item) => { const v = row(item, 'medicine'); return { name: text(v.name, 'name'), quantity: number(v.quantity, 'quantity') }; }),
      };
    }
    if (source.kind === 'service') {
      const catalog = source.current_catalog === null ? null : row(source.current_catalog, 'current_catalog');
      return {
        kind: 'service', serviceId: text(source.service_id, 'service_id'), serviceName: text(source.service_name, 'service_name'),
        trend: list(source.trend, 'trend').map((item) => { const v = row(item, 'trend'); return { date: date(v.date, 'date'), volume: number(v.volume, 'volume'), revenue: number(v.revenue, 'revenue') }; }),
        doctorContribution: list(source.doctor_contribution, 'doctor_contribution').map((item) => { const v = row(item, 'doctor'); return { doctorId: text(v.doctor_id, 'doctor_id'), doctorName: text(v.doctor_name, 'doctor_name'), volume: number(v.volume, 'volume') }; }),
        paymentMix: list(source.payment_mix, 'payment_mix').map((item) => { const v = row(item, 'payment'); return { paymentType: payment(v.payment_type), visits: count(v.visits, 'visits') }; }),
        visits: list(source.visits, 'visits').map((item) => { const v = row(item, 'visit'); return { queueEntryId: text(v.queue_entry_id, 'queue_entry_id'), queueSequence: v.queue_sequence === null ? null : count(v.queue_sequence, 'queue_sequence'), visitDate: date(v.visit_date, 'visit_date'), paymentType: payment(v.payment_type), quantity: number(v.quantity, 'quantity'), unitPrice: number(v.unit_price, 'unit_price'), totalPrice: number(v.total_price, 'total_price'), cogs: nullable(v.cogs, 'cogs'), grossProfit: nullable(v.gross_profit, 'gross_profit') }; }),
        currentCatalog: catalog ? { price: number(catalog.price, 'price'), cogs: nullable(catalog.cogs, 'cogs'), grossProfit: nullable(catalog.gross_profit, 'gross_profit'), marginPct: nullable(catalog.margin_pct, 'margin_pct') } : null,
        marginHistory: list(source.margin_history, 'margin_history').map((item) => { const v = row(item, 'history'); return { date: date(v.date, 'date'), averagePrice: number(v.average_price, 'average_price'), averageCogs: nullable(v.average_cogs, 'average_cogs'), marginPct: nullable(v.margin_pct, 'margin_pct') }; }),
      };
    }
    throw new Error('kind is invalid');
  } catch (error) {
    throw new Error(`Invalid Insight performance detail: ${error instanceof Error ? error.message : 'unknown payload'}`);
  }
}
