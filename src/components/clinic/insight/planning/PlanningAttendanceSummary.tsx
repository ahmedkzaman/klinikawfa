import { useState } from 'react';
import { AttendanceHourlyHeatmap } from '@/components/clinic/dashboard/AttendanceHourlyHeatmap';
import { AttendancePeriodDetails } from '@/components/clinic/dashboard/AttendancePeriodDetails';
import { AttendancePeriodHeatmap } from '@/components/clinic/dashboard/AttendancePeriodHeatmap';
import { AttendanceRecommendations } from '@/components/clinic/dashboard/AttendanceRecommendations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { AttendanceHeatmapCell, DoctorOffDayAssessment } from '@/lib/clinic/attendanceHeatmap';
import type { AttendancePeriodAnalysis, AttendancePeriodSummary } from '@/lib/clinic/attendancePeriodAnalysis';
import type { AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

function display(value: number | null): string { return value === null ? 'Unavailable' : value.toFixed(1); }
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hourlyLabel(cell: AttendanceHeatmapCell): string {
  const start = `${String(cell.hour).padStart(2, '0')}:00`;
  const endHour = (cell.hour + 1) % 24;
  const end = `${String(endHour).padStart(2, '0')}:00`;
  const weekday = weekdayNames[cell.weekday - 1] ?? `Weekday ${cell.weekday}`;
  const visits = display(cell.averageVisits);
  const peak = display(cell.peakVisits);
  const wait = cell.averageWaitMinutes == null ? 'wait unavailable' : `${display(cell.averageWaitMinutes)} min wait`;
  return `${weekday} ${start}-${end}: average ${visits} visits, peak ${peak}, ${wait}, ${cell.coverage} coverage.`;
}

export function PlanningAttendanceSummary({ analysis, regression, cells, offDayAssessments }: {
  analysis: AttendancePeriodAnalysis;
  regression: AttendanceRegressionResult;
  cells: AttendanceHeatmapCell[];
  offDayAssessments: DoctorOffDayAssessment[];
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<AttendancePeriodSummary | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const recommendation = analysis.decisions.training.status === 'ready'
    ? analysis.decisions.training
    : analysis.decisions.peak;
  const selected = selectedPeriod ?? analysis.periods[0] ?? null;
  const observedAverage = selected?.hourly.length
    ? selected.hourly.reduce((sum, item) => sum + (item.cell?.averageVisits ?? 0), 0) / selected.hourly.length
    : null;
  const observedPeak = selected?.hourly.reduce((peak, item) => Math.max(peak, item.cell?.peakVisits ?? 0), 0) ?? null;
  const veto = recommendation.status === 'ready'
    ? recommendation.reason
    : selected?.safetyReasons[0] ?? 'No regression-qualified planning recommendation is available.';

  return (
    <Card>
      <CardHeader><CardTitle>Attendance planning</CardTitle><p className="text-sm text-slate-500">Choose one weekday period for aggregate attendance, wait, roster coverage, and regression evidence. The hourly heatmap remains in advanced detail.</p></CardHeader>
      <CardContent className="space-y-4">
        <section role="region" aria-label="Regression recommendation" className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">Regression recommendation</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-slate-500">Regression status</dt><dd className="font-medium">{regression.status === 'ready' ? 'Ready' : 'Unavailable'}</dd></div>
            <div><dt className="text-slate-500">Predicted attendance</dt><dd className="font-medium">{display(recommendation.expectedVisits)} visits</dd></div>
            <div><dt className="text-slate-500">Uncertainty</dt><dd className="font-medium">{display(recommendation.lowerPrediction)}–{display(recommendation.upperPrediction)}</dd></div>
            <div><dt className="text-slate-500">Veto reason</dt><dd className="font-medium">{veto}</dd></div>
            <div><dt className="text-slate-500">Observed context</dt><dd className="font-medium">Average {display(observedAverage)} · peak {display(observedPeak)} · wait {selected?.hourly[0]?.cell?.averageWaitMinutes === null ? 'Unavailable' : `${display(selected?.hourly[0]?.cell?.averageWaitMinutes ?? null)} min`}</dd></div>
            <div><dt className="text-slate-500">Model/data confidence</dt><dd className="font-medium">{selected?.confidence ?? 'insufficient'} · {regression.diagnostics.usableWeeks} usable weeks</dd></div>
          </dl>
        </section>
        <AttendancePeriodHeatmap analysis={analysis} onSelectPeriod={setSelectedPeriod} />
        <section aria-labelledby="attendance-period-text-summary" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <h3 id="attendance-period-text-summary" className="font-semibold text-slate-900">Attendance period text summary</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {analysis.periods.map((period) => (
              <li key={`${period.weekday}-${period.periodId}`} className="rounded-md bg-slate-50 p-3">
                <span className="font-medium">{period.label}</span>: expected {display(period.expectedVisits)} visits, confidence {period.confidence}.
              </li>
            ))}
          </ul>
        </section>
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="rounded-md border px-3 py-2 text-sm font-medium text-slate-700">{advancedOpen ? 'Hide advanced detail' : 'Advanced detail'}</CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            <AttendanceHourlyHeatmap cells={cells} onSelectCell={() => undefined} />
            <section aria-labelledby="hourly-attendance-text-summary" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <h3 id="hourly-attendance-text-summary" className="font-semibold text-slate-900">Hourly attendance text summary</h3>
              <p className="mt-1 text-slate-500">Readable version of the advanced heatmap, grouped by day and hour.</p>
              <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-2 md:grid-cols-2" aria-label="Hourly attendance summary">
                {cells.map((cell) => (
                  <li key={`${cell.weekday}-${cell.hour}`} className="rounded-md bg-slate-50 p-3 text-slate-700">
                    {hourlyLabel(cell)}
                  </li>
                ))}
              </ul>
            </section>
            <AttendanceRecommendations cells={cells} selectedDoctorId={null} regression={regression} offDayAssessments={offDayAssessments} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      <AttendancePeriodDetails period={selectedPeriod} open={selectedPeriod !== null} onOpenChange={(open) => !open && setSelectedPeriod(null)} />
    </Card>
  );
}
