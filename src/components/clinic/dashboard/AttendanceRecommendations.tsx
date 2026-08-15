import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildAttendanceRecommendations,
  type AttendanceHeatmapCell,
  type DoctorOffDayAssessment,
} from '@/lib/clinic/attendanceHeatmap';
import type { AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hour(value: number): string {
  return `${String(value).padStart(2, '0')}:00`;
}

function evidence(item: { sampleSize: number; evidence: { averageVisits: number | null; peakVisits: number | null; averageWaitMinutes: number | null } }): string {
  const values = [`${item.sampleSize} operating-date samples`, `average ${item.evidence.averageVisits ?? 'unavailable'} visits`];
  if (item.evidence.peakVisits !== null) values.push(`peak ${item.evidence.peakVisits}`);
  if (item.evidence.averageWaitMinutes !== null) values.push(`${item.evidence.averageWaitMinutes} min average wait`);
  return values.join(' · ');
}

function decimal(value: number): string {
  return value.toFixed(1);
}

function signedDecimal(value: number): string {
  return `${value >= 0 ? '+' : ''}${decimal(value)}`;
}

const reasonPriority = [
  'Backup doctor coverage is incomplete.',
  'Average wait exceeds 45 minutes.',
  'Predicted daily attendance is not among the lowest eligible weekdays.',
  'Daily upper prediction reaches the busy-day threshold.',
  'Predicted busiest hour is in the busiest quartile.',
  'Hourly upper prediction crosses the busy threshold.',
  'Observed peak is in the busiest weekday quartile.',
  'Prediction volatility is too high.',
  'Fewer than 8 comparable dates.',
  'Not enough data for regression recommendation',
  'Regression model did not converge',
  'Attendance regression is unavailable.',
  'Off-day safety assessment is unavailable.',
];

function reasonPriorityIndex(reason: string): number {
  const index = reasonPriority.findIndex((candidate) => reason.startsWith(candidate));
  return index === -1 ? reasonPriority.length : index;
}

function offDayReasons(assessments: DoctorOffDayAssessment[]): string[] {
  return [...new Set(assessments.flatMap((assessment) => assessment.reasons))]
    .map((reason, index) => ({ reason, index }))
    .sort((left, right) => reasonPriorityIndex(left.reason) - reasonPriorityIndex(right.reason) || left.index - right.index)
    .map(({ reason }) => reason);
}

function OffDayRecommendation({ assessment, usableWeeks, safeCandidateCount, showBackupCoverage }: {
  assessment: DoctorOffDayAssessment;
  usableWeeks: number;
  safeCandidateCount: number;
  showBackupCoverage: boolean;
}) {
  const forecast = assessment.forecast;
  if (!forecast) return null;

  const score = assessment.safetyScore === null ? 'unavailable' : decimal(assessment.safetyScore);
  const whySafest = assessment.passedChecks.length > 0
    ? `Ranked safest: safety score ${score} is the lowest of ${safeCandidateCount} safe candidate${safeCandidateCount === 1 ? '' : 's'}. It passed: ${assessment.passedChecks.slice(0, 3).join(' ')}`
    : `Ranked safest: safety score ${score} is the lowest of ${safeCandidateCount} safe candidate${safeCandidateCount === 1 ? '' : 's'}.`;

  return (
    <li className="rounded-md bg-slate-50 p-3">
      <p className="font-medium text-slate-800">{weekdays[forecast.weekday - 1]} — possible doctor off-day</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        <li>Predicted visits: {decimal(forecast.expectedTotal)}</li>
        <li>Prediction range: {decimal(forecast.lowerPrediction)}–{decimal(forecast.upperPrediction)}</li>
        <li>Highest-risk hour: {hour(forecast.highestExpectedHour.hour)} ({decimal(forecast.highestExpectedHour.expectedVisits)})</li>
        <li>Hour prediction range: {decimal(forecast.highestExpectedHour.lowerPrediction)}–{decimal(forecast.highestExpectedHour.upperPrediction)}</li>
        <li>Risk-hour observed average: {decimal(forecast.highestExpectedHour.observedAverage)}</li>
        <li>Risk-hour observed median: {decimal(forecast.highestExpectedHour.observedMedian)}</li>
        <li>Risk-hour observed peak: {decimal(forecast.highestExpectedHour.observedPeak)}</li>
        <li>Risk-hour recent trend: {forecast.highestExpectedHour.recentTrend === null ? 'unavailable' : `${signedDecimal(forecast.highestExpectedHour.recentTrend)} visits vs previous 4 occurrences`}</li>
        <li>Risk-hour average wait: {forecast.highestExpectedHour.averageWaitMinutes === null ? 'unavailable' : `${decimal(forecast.highestExpectedHour.averageWaitMinutes)} min`}</li>
        <li>Risk-hour measured waits: {forecast.highestExpectedHour.waitMeasuredVisits}</li>
        <li>Weekday highest observed hourly peak: {decimal(forecast.highestObservedPeak)}</li>
        <li>Weekday observed average: {decimal(forecast.observedAverage)}</li>
        <li>Weekday observed median: {decimal(forecast.observedMedian)}</li>
        <li>Weekday recent trend: {forecast.recentTrend === null ? 'unavailable' : `${signedDecimal(forecast.recentTrend)} visits vs previous 4 comparable dates`}</li>
        <li>Weekday average wait: {forecast.averageWaitMinutes === null ? 'unavailable' : `${decimal(forecast.averageWaitMinutes)} min`}</li>
        <li>Usable weeks / comparable dates: {usableWeeks} / {forecast.comparableDates}</li>
        {showBackupCoverage && <li>Backup coverage: {decimal(forecast.backupCoverageRate * 100)}%</li>}
        <li>Safety score: {score}</li>
      </ul>
      <p className="mt-2 text-sm text-slate-700">{whySafest}</p>
    </li>
  );
}

function OffDayAssessmentPanel({ assessments, regression, selectedDoctorId }: {
  assessments: DoctorOffDayAssessment[];
  regression: AttendanceRegressionResult;
  selectedDoctorId: string | null;
}) {
  const suggestions = assessments
    .filter((assessment) => assessment.status === 'suggested' && assessment.forecast !== null)
    .sort((left, right) => (left.safetyScore ?? Infinity) - (right.safetyScore ?? Infinity) || (left.weekday ?? Infinity) - (right.weekday ?? Infinity));
  const reasons = offDayReasons(assessments);
  const checksByWeekday = assessments.map((assessment) => ({
    label: assessment.weekday === null ? 'Overall model' : weekdays[assessment.weekday - 1],
    checks: [
      ...assessment.reasons.map((reason) => ({ outcome: 'Does not pass', reason })),
      ...assessment.passedChecks.map((reason) => ({ outcome: 'Passes', reason })),
    ],
  }));
  const hasChecks = checksByWeekday.some(group => group.checks.length > 0);

  return (
    <section aria-label="Possible doctor off-day suggestion">
      <h3 className="text-sm font-semibold text-slate-800">Possible doctor off-day — suggestion only</h3>
      <p className="mt-1 text-sm text-slate-600">Planning aid only — confirm against roster and current operations.</p>
      {suggestions.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          <OffDayRecommendation assessment={suggestions[0]} usableWeeks={regression.diagnostics.usableWeeks} safeCandidateCount={suggestions.length} showBackupCoverage={selectedDoctorId !== null} />
        </ul>
      ) : (
        <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          <h4 className="font-medium text-slate-800">No safe off-day recommendation</h4>
          {reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="Highest-priority safety reasons">{reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          <details className="mt-3" aria-label="Safety checks">
            <summary className="cursor-pointer font-medium text-slate-800">View all checks by weekday</summary>
            {hasChecks
              ? <div className="mt-2 space-y-3">{checksByWeekday.filter(group => group.checks.length > 0).map((group, groupIndex) => <section key={`${group.label}-${groupIndex}`} aria-label={`${group.label} safety checks`}><h5 className="font-medium text-slate-800">{group.label} safety checks</h5><ul className="mt-1 list-disc space-y-1 pl-5">{group.checks.map(({ outcome, reason }, index) => <li key={`${outcome}-${reason}-${index}`}><span className="font-medium">{outcome}:</span> {reason}</li>)}</ul></section>)}</div>
              : <p className="mt-2">No detailed safety checks are available.</p>}
          </details>
        </div>
      )}
    </section>
  );
}

export function AttendanceRecommendations({ cells, selectedDoctorId, regression, offDayAssessments }: {
  cells: AttendanceHeatmapCell[];
  selectedDoctorId: string | null;
  regression: AttendanceRegressionResult;
  offDayAssessments: DoctorOffDayAssessment[];
}) {
  const recommendations = buildAttendanceRecommendations(cells, selectedDoctorId);
  const sections = [
    {
      title: 'Training windows',
      items: recommendations.trainingWindows,
      description: (item: typeof recommendations.trainingWindows[number]) => `${weekdays[item.weekday - 1]} ${hour(item.startHour)}–${hour(item.endHour)} · Training window · ${evidence(item)}`,
    },
    {
      title: 'Peak staffing',
      items: recommendations.peakStaffing,
      description: (item: typeof recommendations.peakStaffing[number]) => `${weekdays[item.weekday - 1]} ${hour(item.hour)} · Peak staffing review · ${evidence(item)}`,
    },
    {
      title: 'Unstable periods',
      items: recommendations.unstablePeaks,
      description: (item: typeof recommendations.unstablePeaks[number]) => `${weekdays[item.weekday - 1]} ${hour(item.hour)} · Unstable period · ${evidence(item)}`,
    },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <OffDayAssessmentPanel assessments={offDayAssessments} regression={regression} selectedDoctorId={selectedDoctorId} />
        {sections.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
            {section.items.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">No evidence-based recommendation for this period.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {section.items.map((item, index) => <li key={`${item.weekday}-${'hour' in item ? item.hour : 'day'}-${index}`} className="rounded-md bg-slate-50 p-2">{section.description(item as never)}</li>)}
              </ul>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
