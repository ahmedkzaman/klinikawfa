export type DashboardCoverage = 'complete' | 'partial' | 'insufficient' | 'catalogue';
export type PurchaseSource = 'received' | 'manual' | 'unavailable';
export type ManualMetricStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';
export type MetricKind = 'currency' | 'number' | 'rating' | 'status' | 'text' | 'checkbox';
export type MetricGroup = 'operations' | 'growth' | 'governance';

export const MANAGEMENT_METRIC_KEYS = [
  'gross_revenue_target', 'locum_pay', 'stock_purchase_manual',
  'stock_availability_feedback', 'initiative_a', 'initiative_b', 'initiative_c',
  'google_rating', 'google_reviews', 'facebook_followers', 'instagram_followers',
  'tiktok_followers', 'facebook_posts', 'instagram_posts', 'tiktok_posts',
  'threads_posts', 'facebook_leads', 'hq_shooting', 'outreach_visits',
  'community_health_events', 'visibility_2', 'visibility_3', 'visibility_4',
  'marketing_meeting', 'staff_meeting_w1', 'staff_cme_w2', 'staff_cme_w4',
  'nsep_w3', 'doctor_alignment', 'doctor_cme_1', 'doctor_cme_2', 'v2v_session',
  'clinic_manager_meeting',
] as const;

export type ManagementMetricKey = (typeof MANAGEMENT_METRIC_KEYS)[number];

type MetricDefinition = {
  label: string;
  group: MetricGroup;
  kind: MetricKind;
  target?: number;
  min?: number;
  max?: number;
};

const metric = (
  label: string,
  group: MetricGroup,
  kind: MetricKind,
  extra: Partial<MetricDefinition> = {},
): MetricDefinition => ({ label, group, kind, ...extra });

export const MANAGEMENT_METRIC_DEFINITIONS: Record<ManagementMetricKey, MetricDefinition> = {
  gross_revenue_target: metric('Monthly gross revenue target', 'operations', 'currency', { target: 80_000, min: 0 }),
  locum_pay: metric('Total locum pay', 'operations', 'currency', { min: 0 }),
  stock_purchase_manual: metric('Stock purchases (manual)', 'operations', 'currency', { min: 0 }),
  stock_availability_feedback: metric('Stock availability feedback', 'operations', 'text'),
  initiative_a: metric('Operation initiative A', 'operations', 'status'),
  initiative_b: metric('Operation initiative B', 'operations', 'status'),
  initiative_c: metric('Operation initiative C', 'operations', 'status'),
  google_rating: metric('Google rating', 'growth', 'rating', { target: 4.5, min: 0, max: 5 }),
  google_reviews: metric('Google reviews', 'growth', 'number', { target: 100, min: 0 }),
  facebook_followers: metric('New Facebook followers', 'growth', 'number', { target: 200, min: 0 }),
  instagram_followers: metric('New Instagram followers', 'growth', 'number', { target: 200, min: 0 }),
  tiktok_followers: metric('New TikTok followers', 'growth', 'number', { target: 200, min: 0 }),
  facebook_posts: metric('Facebook posts', 'growth', 'number', { target: 8, min: 0 }),
  instagram_posts: metric('Instagram posts', 'growth', 'number', { target: 8, min: 0 }),
  tiktok_posts: metric('TikTok posts', 'growth', 'number', { target: 8, min: 0 }),
  threads_posts: metric('Threads posts', 'growth', 'number', { target: 8, min: 0 }),
  facebook_leads: metric('Facebook leads', 'growth', 'number', { min: 0 }),
  hq_shooting: metric('HQ shooting session', 'growth', 'checkbox', { target: 1 }),
  outreach_visits: metric('Field outreach visits', 'growth', 'number', { target: 4, min: 0 }),
  community_health_events: metric('Community health events', 'growth', 'number', { target: 1, min: 0 }),
  visibility_2: metric('Visibility initiative 2', 'growth', 'checkbox', { target: 1 }),
  visibility_3: metric('Visibility initiative 3', 'growth', 'checkbox', { target: 1 }),
  visibility_4: metric('Visibility initiative 4', 'growth', 'checkbox', { target: 1 }),
  marketing_meeting: metric('Monthly marketing meeting', 'governance', 'checkbox', { target: 1 }),
  staff_meeting_w1: metric('Monthly staff meeting — W1', 'governance', 'checkbox', { target: 1 }),
  staff_cme_w2: metric('Staff CME — W2', 'governance', 'checkbox', { target: 1 }),
  staff_cme_w4: metric('Staff CME — W4', 'governance', 'checkbox', { target: 1 }),
  nsep_w3: metric('NSEP — W3', 'governance', 'checkbox', { target: 1 }),
  doctor_alignment: metric('Doctor alignment meeting', 'governance', 'checkbox', { target: 1 }),
  doctor_cme_1: metric('Doctor CME 1', 'governance', 'checkbox', { target: 1 }),
  doctor_cme_2: metric('Doctor CME 2', 'governance', 'checkbox', { target: 1 }),
  v2v_session: metric('Vision to Value session', 'governance', 'checkbox', { target: 1 }),
  clinic_manager_meeting: metric('Clinic Manager Meeting', 'governance', 'checkbox', { target: 1 }),
};

export interface DashboardManualMetric {
  id: string;
  month_start: string;
  metric_key: ManagementMetricKey;
  target_numeric: number | null;
  actual_numeric: number | null;
  status: ManualMetricStatus | null;
  notes: string;
  updated_by: string;
  updated_at: string;
}

export interface DashboardManualMetricInput {
  monthStart: string;
  metricKey: ManagementMetricKey;
  targetNumeric: number | null;
  actualNumeric: number | null;
  status: ManualMetricStatus | null;
  notes: string;
}

export interface ManagementDashboardReport {
  period: { monthStart: string; asOfDate: string; timezone: string };
  operations: {
    totalPax: number;
    averageWaitMinutes: number | null;
    waitMeasuredVisits: number;
    daily: Array<{ date: string; pax: number; averageWaitMinutes: number | null; measuredVisits: number }>;
  };
  financial: {
    grossRevenue: number;
    patientCollections: number;
    panelCollections: number;
    collections: number;
    revenueByDoctor: Array<{ doctorId: string | null; doctorName: string; grossRevenue: number }>;
    approvedOtHours: number;
    approvedOtPay: number;
    incompleteAttributionCount: number;
  };
  stock: {
    purchaseAmount: number | null;
    purchaseSource: PurchaseSource;
    purchasePercent: number | null;
    expiredCount: number;
    expirySource: 'batch' | 'catalogue';
    stockRevenue: number;
    stockCogs: number;
    stockMarginPercent: number | null;
  };
  appointments: {
    scheduled: number;
    attended: number;
    denominator: number;
    measured: number;
    conversionPercent: number | null;
    coverage: DashboardCoverage;
  };
  coverage: {
    financial: DashboardCoverage;
    waiting: DashboardCoverage;
    inventory: DashboardCoverage | 'batch';
    appointments: DashboardCoverage;
  };
}

const EMPTY_REPORT: ManagementDashboardReport = {
  period: { monthStart: '', asOfDate: '', timezone: 'Asia/Kuala_Lumpur' },
  operations: { totalPax: 0, averageWaitMinutes: null, waitMeasuredVisits: 0, daily: [] },
  financial: {
    grossRevenue: 0, patientCollections: 0, panelCollections: 0, collections: 0,
    revenueByDoctor: [], approvedOtHours: 0, approvedOtPay: 0,
    incompleteAttributionCount: 0,
  },
  stock: {
    purchaseAmount: null, purchaseSource: 'unavailable', purchasePercent: null,
    expiredCount: 0, expirySource: 'catalogue', stockRevenue: 0, stockCogs: 0,
    stockMarginPercent: null,
  },
  appointments: {
    scheduled: 0, attended: 0, denominator: 0, measured: 0,
    conversionPercent: null, coverage: 'insufficient',
  },
  coverage: {
    financial: 'insufficient', waiting: 'insufficient', inventory: 'catalogue',
    appointments: 'insufficient',
  },
};

export function normalizeDashboardReport(raw: unknown): ManagementDashboardReport {
  if (!raw || typeof raw !== 'object') return EMPTY_REPORT;
  const value = raw as Partial<ManagementDashboardReport>;
  return {
    ...EMPTY_REPORT,
    ...value,
    period: { ...EMPTY_REPORT.period, ...value.period },
    operations: { ...EMPTY_REPORT.operations, ...value.operations },
    financial: { ...EMPTY_REPORT.financial, ...value.financial },
    stock: { ...EMPTY_REPORT.stock, ...value.stock },
    appointments: { ...EMPTY_REPORT.appointments, ...value.appointments },
    coverage: { ...EMPTY_REPORT.coverage, ...value.coverage },
  };
}

export function calculateAchievement(actual: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

export function getCoverageLabel(coverage: DashboardCoverage, measured: number): string {
  if (coverage === 'insufficient' || measured === 0) return 'Insufficient tracked data';
  if (coverage === 'partial') return 'Partial tracked data';
  if (coverage === 'catalogue') return 'Catalogue-level data';
  return 'Complete tracked data';
}
