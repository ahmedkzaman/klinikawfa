import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { calculateAchievement, getCoverageLabel, type ManagementDashboardReport } from '@/lib/clinic/managementDashboard';

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DashboardKpiStrip({
  report,
  revenueTarget,
}: {
  report: ManagementDashboardReport;
  revenueTarget: number | null;
}) {
  const achievement = calculateAchievement(report.financial.grossRevenue, revenueTarget);
  const waitingAlert = (report.operations.averageWaitMinutes ?? 0) > 45;
  const cards = [
    { label: 'Total patients', value: report.operations.totalPax.toLocaleString(), note: 'Visits / pax' },
    {
      label: 'Average waiting',
      value: report.operations.averageWaitMinutes === null ? 'Unavailable' : `${report.operations.averageWaitMinutes} min`,
      note: report.operations.waitMeasuredVisits > 0
        ? `Measured from ${report.operations.waitMeasuredVisits} called visit${report.operations.waitMeasuredVisits === 1 ? '' : 's'}`
        : getCoverageLabel('insufficient', 0),
      alert: waitingAlert,
    },
    { label: 'MTD gross revenue', value: rm(report.financial.grossRevenue), note: 'Completed visit billing' },
    { label: 'MTD collections', value: rm(report.financial.collections), note: `${rm(report.financial.patientCollections)} patient · ${rm(report.financial.panelCollections)} panel` },
    {
      label: 'MTD achievement',
      value: achievement === null ? 'Set target' : `${achievement}%`,
      note: revenueTarget ? `Target ${rm(revenueTarget)}` : 'Monthly target not entered',
      progress: achievement,
    },
    {
      label: 'Appointment conversion',
      value: report.appointments.conversionPercent === null ? 'Unavailable' : `${report.appointments.conversionPercent}%`,
      note: report.appointments.measured === 0
        ? 'Insufficient tracked data'
        : `${report.appointments.attended} attended / ${report.appointments.denominator} scheduled`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label} className={card.alert ? 'border-amber-300 bg-amber-50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {card.label}
              {card.alert && <Badge variant="destructive">Alert</Badge>}
            </div>
            <div className="mt-2 text-xl font-bold text-slate-900">{card.value}</div>
            {card.progress !== undefined && card.progress !== null && (
              <Progress value={Math.min(card.progress, 100)} className="mt-2 h-1.5" />
            )}
            <p className="mt-2 text-xs text-slate-500">{card.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
