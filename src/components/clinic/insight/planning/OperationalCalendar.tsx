import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceDecisionSummary } from '@/lib/clinic/attendancePeriodAnalysis';
import type { AttendanceRegressionResult } from '@/lib/clinic/attendanceRegression';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const periodLabels: Record<string, string> = {
  '08_13': '08:00-13:00',
  '14_19': '14:00-19:00',
  '20_24': '20:00-00:00',
};

function candidate(decision: AttendanceDecisionSummary[keyof AttendanceDecisionSummary]): string {
  if (decision.status !== 'ready' || decision.weekday === null) return `${decision.title}: no regression-qualified candidate`;
  return `${decision.title}: ${weekdays[decision.weekday - 1]}${decision.periodId ? `, ${periodLabels[decision.periodId] ?? decision.periodId.replace('_', ':00-')}` : ''}`;
}

export function OperationalCalendar({ decisions, regression }: { decisions: AttendanceDecisionSummary; regression: AttendanceRegressionResult }) {
  const trend = regression.status !== 'ready' ? 'unavailable' : regression.weekdays.reduce((sum, item) => sum + (item.recentTrend ?? 0), 0) > 0.25 ? 'rising' : regression.weekdays.reduce((sum, item) => sum + (item.recentTrend ?? 0), 0) < -0.25 ? 'falling' : 'steady';
  return (
    <Card>
      <CardHeader><CardTitle>Operational calendar</CardTitle><p className="text-sm text-slate-500">Forecast direction: {trend}. Model confidence is based on {regression.diagnostics.usableWeeks} usable weeks.</p></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="grid gap-2 md:grid-cols-3"><li className="rounded-md bg-slate-50 p-3">{candidate(decisions.training)}<p className="mt-1 text-slate-600">{decisions.training.reason}</p></li><li className="rounded-md bg-slate-50 p-3">{candidate(decisions.offDay)}<p className="mt-1 text-slate-600">{decisions.offDay.reason}</p></li><li className="rounded-md bg-slate-50 p-3">{candidate(decisions.peak)}<p className="mt-1 text-slate-600">{decisions.peak.reason}</p></li></ul>
        <p><a className="font-medium text-primary underline-offset-4 hover:underline" href="/staff/dr-roster">Open roster editor</a> to confirm saved S1, S2, and S3 coverage before actioning any candidate.</p>
        <p><a className="font-medium text-primary underline-offset-4 hover:underline" href="/clinic/dashboard">Open Management Dashboard</a> for marketing, Google reviews, governance, targets, and manual aggregate inputs.</p>
      </CardContent>
    </Card>
  );
}
