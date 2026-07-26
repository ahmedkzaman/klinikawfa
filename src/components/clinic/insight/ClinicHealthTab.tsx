import { Card, CardContent } from '@/components/ui/card';
import { HealthAlertsList } from './HealthAlertsList';
import { HealthScoreCard } from './HealthScoreCard';
import { useClinicHealth } from '@/hooks/clinic/useClinicHealth';

export function ClinicHealthTab({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const { data, isLoading, isError, error } = useClinicHealth(startDate, endDate);
  if (isLoading) return <Card><CardContent className="p-6 text-sm text-slate-500">Loading clinic health…</CardContent></Card>;
  if (isError) return <Card><CardContent className="p-6 text-sm text-rose-600">Failed to load clinic health: {(error as Error)?.message ?? 'Unknown error'}</CardContent></Card>;
  if (!data) return <Card><CardContent className="p-6 text-sm text-slate-500">No clinic health data available.</CardContent></Card>;
  const { metrics } = data;
  return (
    <div className="space-y-4">
      <HealthScoreCard score={data.score} />
      <HealthAlertsList alerts={data.alerts} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ['Revenue', `RM ${Number(metrics.financial.revenue).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`],
          ['Completed visits', metrics.visits.completed],
          ['Outstanding claims', `RM ${Number(metrics.claims.outstandingAmount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`],
          ['Out of stock', metrics.inventory.outOfStockCount],
          ['Missing panel fees', metrics.panelFees.missingDefaultCount],
          ['Data-quality exceptions', metrics.dataQuality.completedWithoutPayment + metrics.dataQuality.panelVisitWithoutPanel + metrics.dataQuality.consultationWithoutFee],
        ].map(([label, value]) => <Card key={String(label)}><CardContent className="p-5"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-slate-900">{value}</div></CardContent></Card>)}
      </div>
    </div>
  );
}
