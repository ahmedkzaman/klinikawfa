import { AlertTriangle, Pencil } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type DashboardManualMetric, type ManagementDashboardReport, type ManagementMetricKey } from '@/lib/clinic/managementDashboard';

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

export function FinancialOperationsPanel({ report, metrics, canEdit, onEdit }: {
  report: ManagementDashboardReport;
  metrics: DashboardManualMetric[];
  canEdit: boolean;
  onEdit: (key: ManagementMetricKey) => void;
}) {
  const byKey = new Map(metrics.map((row) => [row.metric_key, row]));
  return (
    <Card className="xl:col-span-2">
      <CardHeader><CardTitle>Financial &amp; Operations</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {report.financial.incompleteAttributionCount > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {report.financial.incompleteAttributionCount} financial row(s) have incomplete attribution.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Approved OT</p><p className="mt-1 text-lg font-bold">{report.financial.approvedOtHours} hours</p><p className="text-xs text-slate-500">{rm(report.financial.approvedOtPay)} aggregate pay</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between"><p className="text-xs text-slate-500">Total locum pay</p>{canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit('locum_pay')} aria-label="Edit total locum pay"><Pencil className="h-3.5 w-3.5" /></Button>}</div><p className="mt-1 text-lg font-bold">{byKey.get('locum_pay')?.actual_numeric == null ? 'Not entered' : rm(byKey.get('locum_pay')!.actual_numeric!)}</p><Badge variant="outline">Manual aggregate</Badge></div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Revenue by doctor</h3>
          {report.financial.revenueByDoctor.length === 0 ? <p className="text-sm text-slate-500">No completed visit revenue in this month.</p> : (
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.financial.revenueByDoctor}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="doctorName" tick={{ fontSize: 10 }} interval={0} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(value: number) => rm(value)} /><Bar dataKey="grossRevenue" fill="#2563eb" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Daily patient &amp; waiting trend</h3>
          {report.operations.daily.length === 0 ? <p className="text-sm text-slate-500">No daily queue activity in this month.</p> : (
            <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={report.operations.daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={(value: string) => value.slice(8)} tick={{ fontSize: 10 }} /><YAxis yAxisId="pax" tick={{ fontSize: 10 }} /><YAxis yAxisId="wait" orientation="right" tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Line yAxisId="pax" type="monotone" dataKey="pax" name="Patients" stroke="#2563eb" strokeWidth={2} /><Line yAxisId="wait" type="monotone" dataKey="averageWaitMinutes" name="Wait (min)" stroke="#f59e0b" strokeWidth={2} connectNulls={false} /></LineChart></ResponsiveContainer></div>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['initiative_a', 'initiative_b', 'initiative_c'] as const).map((key, index) => {
            const row = byKey.get(key);
            return <button key={key} type="button" disabled={!canEdit} onClick={() => canEdit && onEdit(key)} className="rounded-xl border p-3 text-left disabled:cursor-default"><p className="text-xs font-semibold">Initiative {String.fromCharCode(65 + index)}</p><p className="mt-1 text-sm text-slate-600">{row?.status?.replace('_', ' ') ?? 'Not started'}</p>{row?.notes && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{row.notes}</p>}</button>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}
