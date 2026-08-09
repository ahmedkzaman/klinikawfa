import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DashboardKpiStrip } from '@/components/clinic/dashboard/DashboardKpiStrip';
import { FinancialOperationsPanel } from '@/components/clinic/dashboard/FinancialOperationsPanel';
import { ManualMetricDialog } from '@/components/clinic/dashboard/ManualMetricDialog';
import { ManualScorecardPanel } from '@/components/clinic/dashboard/ManualScorecardPanel';
import { StockInventoryPanel } from '@/components/clinic/dashboard/StockInventoryPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useDeleteManagementDashboardMetric, useManagementDashboardManual, useManagementDashboardReport, useSetManagementDashboardMetric } from '@/hooks/clinic/useManagementDashboard';
import { type ManagementMetricKey } from '@/lib/clinic/managementDashboard';

function malaysiaMonth(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export default function ManagementDashboard() {
  const [month, setMonth] = useState(malaysiaMonth);
  const monthStart = `${month}-01`;
  const [editing, setEditing] = useState<ManagementMetricKey | null>(null);
  const { canEditManagementDashboard } = useAuth();
  const reportQuery = useManagementDashboardReport(monthStart);
  const manualQuery = useManagementDashboardManual(monthStart);
  const saveMetric = useSetManagementDashboardMetric();
  const deleteMetric = useDeleteManagementDashboardMetric();
  const metrics = useMemo(() => manualQuery.data ?? [], [manualQuery.data]);
  const editingValue = useMemo(
    () => metrics.find((row) => row.metric_key === editing),
    [editing, metrics],
  );
  const revenueTarget = metrics.find((row) => row.metric_key === 'gross_revenue_target')?.target_numeric
    ?? metrics.find((row) => row.metric_key === 'gross_revenue_target')?.actual_numeric
    ?? null;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Clinic command centre</p><h1 className="text-2xl font-bold text-slate-900">Management Dashboard</h1><p className="mt-1 text-sm text-slate-500">Daily operations and monthly clinic health, separated by source and confidence.</p></div>
        <div className="flex items-center gap-2"><label htmlFor="dashboard-month" className="text-sm font-medium">Month</label><input id="dashboard-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm" /><Button variant="outline" size="icon" onClick={() => { reportQuery.refetch(); manualQuery.refetch(); }} aria-label="Refresh dashboard"><RefreshCw className="h-4 w-4" /></Button></div>
      </div>
      {canEditManagementDashboard && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing('gross_revenue_target')}>Edit revenue target</Button>
          <Button variant="outline" onClick={() => setEditing('stock_purchase_manual')}>Enter stock purchases</Button>
        </div>
      )}

      {reportQuery.isLoading && <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">Loading automatic clinic metrics…</div>}
      {reportQuery.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Automatic metrics could not load: {reportQuery.error.message}. Manual management records remain available.</div>}
      {reportQuery.data && <>
        <DashboardKpiStrip report={reportQuery.data} revenueTarget={revenueTarget} />
        <div className="grid gap-4 xl:grid-cols-3"><FinancialOperationsPanel report={reportQuery.data} metrics={metrics} canEdit={canEditManagementDashboard} onEdit={setEditing} /><StockInventoryPanel report={reportQuery.data} metrics={metrics} canEdit={canEditManagementDashboard} onEdit={setEditing} /></div>
      </>}

      {manualQuery.isLoading && <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Loading monthly management records…</div>}
      {manualQuery.error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Monthly records could not load: {manualQuery.error.message}. Automatic metrics above remain available.</div>}
      {!manualQuery.isLoading && <div className="grid gap-4 xl:grid-cols-2"><ManualScorecardPanel title="Growth & Marketing" group="growth" metrics={metrics} canEdit={canEditManagementDashboard} onEdit={setEditing} /><ManualScorecardPanel title="Governance & Operational Cadence" group="governance" metrics={metrics} canEdit={canEditManagementDashboard} onEdit={setEditing} /></div>}

      {canEditManagementDashboard && <ManualMetricDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} monthStart={monthStart} metricKey={editing} value={editingValue} pending={saveMetric.isPending || deleteMetric.isPending} onSave={(input) => saveMetric.mutate(input, { onSuccess: () => { toast.success('Dashboard record saved'); setEditing(null); }, onError: (error) => toast.error(error.message) })} onDelete={() => editing && deleteMetric.mutate({ monthStart, metricKey: editing }, { onSuccess: () => { toast.success('Dashboard record deleted'); setEditing(null); }, onError: (error) => toast.error(error.message) })} />}
    </div>
  );
}
