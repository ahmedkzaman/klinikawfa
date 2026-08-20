import { useMemo } from 'react';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { PlanningAttendanceSummary } from '@/components/clinic/insight/planning/PlanningAttendanceSummary';
import { DoctorCoveragePlan } from '@/components/clinic/insight/planning/DoctorCoveragePlan';
import { OperationalCalendar } from '@/components/clinic/insight/planning/OperationalCalendar';
import { InsightState } from '@/components/clinic/insight/shared/InsightState';
import { useAttendanceHeatmap } from '@/hooks/clinic/useAttendanceHeatmap';
import { assessDoctorOffDays, type AttendanceHeatmapCell, type DoctorOffDayAssessment } from '@/lib/clinic/attendanceHeatmap';
import { buildAttendancePeriodAnalysis } from '@/lib/clinic/attendancePeriodAnalysis';
import { fitAttendanceRegression, type AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

const emptyCells: AttendanceHeatmapCell[] = [];

function unavailableRegression(reason: string, observationCount: number): AttendanceRegressionResult {
  return { status: 'unavailable', diagnostics: { family: 'negative_binomial', converged: false, iterations: 0, usableWeeks: 0, observationCount, dispersion: Number.NaN, warnings: [reason] }, reasons: [reason] };
}

function unavailableAssessments(reason: string): DoctorOffDayAssessment[] {
  return [{ status: 'unavailable', weekday: null, forecast: null, safetyScore: null, reasons: [reason], passedChecks: [] }];
}

const PLANNING_MIN_WEEKS = 12;
const PLANNING_MIN_DAYS = PLANNING_MIN_WEEKS * 7;
const PLANNING_DEFAULT_DAYS = 90;

function ensurePlanningRange(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
  const spanDays = differenceInCalendarDays(endDate, startDate);
  if (spanDays >= PLANNING_MIN_DAYS) return { startDate, endDate };
  const widenedStart = subDays(endDate, Math.max(spanDays, PLANNING_DEFAULT_DAYS));
  return { startDate: widenedStart, endDate };
}

export function PlanningTab({ startDate, endDate, enabled = true }: { startDate: Date; endDate: Date; enabled?: boolean }) {
  const planningRange = useMemo(() => ensurePlanningRange(startDate, endDate), [startDate, endDate]);
  const attendance = useAttendanceHeatmap({
    startDate: enabled ? format(planningRange.startDate, 'yyyy-MM-dd') : '',
    endDate: enabled ? format(planningRange.endDate, 'yyyy-MM-dd') : '',
    doctorId: null,
    permissionDomain: 'insight',
  });
  const cells = attendance.data?.cells ?? emptyCells;
  const regression = useMemo(() => {
    try { return fitAttendanceRegression(attendance.data?.observations ?? [], null); }
    catch { return unavailableRegression('Attendance regression is unavailable. Descriptive attendance remains available.', attendance.data?.observations.length ?? 0); }
  }, [attendance.data?.observations]);
  const offDayAssessments = useMemo(() => {
    try { return assessDoctorOffDays(cells, regression, null); }
    catch { return unavailableAssessments('Off-day safety assessment is unavailable. Descriptive attendance remains available.'); }
  }, [cells, regression]);
  const analysis = useMemo(() => buildAttendancePeriodAnalysis({ regression, cells, offDayAssessments, selectedDoctorId: null }), [regression, cells, offDayAssessments]);

  if (attendance.isLoading && !attendance.data) return <InsightState state="loading" label="Loading planning attendance…" />;
  if (attendance.isError && !attendance.data) return <InsightState state="error" label="Planning attendance" error={attendance.error} onRetry={() => { void attendance.refetch(); }} retryLabel="Retry planning attendance" />;
  if (!attendance.data || !attendance.data.hasAttendanceData) return <InsightState state="empty" label="No attendance or roster coverage is available for planning in this period." />;

  return (
    <div className="space-y-4">
      {attendance.isError ? <InsightState state="partial" label="Planning is showing the last available attendance result." onRetry={() => { void attendance.refetch(); }} retryLabel="Retry planning attendance" /> : null}
      {attendance.data.warnings.map((warning) => <p key={warning} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{warning}</p>)}
      <PlanningAttendanceSummary analysis={analysis} regression={regression} cells={cells} offDayAssessments={offDayAssessments} />
      <DoctorCoveragePlan analysis={analysis} regression={regression} observations={attendance.data.observations} doctors={attendance.data.doctors} />
      <OperationalCalendar decisions={analysis.decisions} regression={regression} />
    </div>
  );
}
