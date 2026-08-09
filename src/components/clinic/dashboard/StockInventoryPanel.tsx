import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type DashboardManualMetric, type ManagementDashboardReport, type ManagementMetricKey } from '@/lib/clinic/managementDashboard';

const rm = (value: number | null) => value === null ? 'Unavailable' : `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

export function StockInventoryPanel({ report, metrics, canEdit, onEdit }: {
  report: ManagementDashboardReport;
  metrics: DashboardManualMetric[];
  canEdit: boolean;
  onEdit: (key: ManagementMetricKey) => void;
}) {
  const feedback = metrics.find((row) => row.metric_key === 'stock_availability_feedback');
  const warning = (report.stock.purchasePercent ?? 0) > 25;
  return (
    <Card>
      <CardHeader><CardTitle>Stock &amp; Inventory</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className={warning ? 'rounded-xl bg-red-50 p-3 text-red-800' : 'rounded-xl bg-slate-50 p-3'}><p className="text-xs">Purchase vs previous sale</p><p className="mt-1 text-xl font-bold">{report.stock.purchasePercent === null ? 'Unavailable' : `${report.stock.purchasePercent}%`}</p><Badge variant="outline" className="mt-1 capitalize">{report.stock.purchaseSource}</Badge></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs">Expired stock</p><p className="mt-1 text-xl font-bold">{report.stock.expiredCount}</p><Badge variant="outline" className="mt-1 capitalize">{report.stock.expirySource}-level</Badge></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs">Stock revenue</p><p className="mt-1 font-bold">{rm(report.stock.stockRevenue)}</p><p className="text-xs text-slate-500">COGS {rm(report.stock.stockCogs)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs">Stock margin</p><p className="mt-1 font-bold">{report.stock.stockMarginPercent === null ? 'Unavailable' : `${report.stock.stockMarginPercent}%`}</p><p className="text-xs text-slate-500">Target ≈ 50%</p></div>
        </div>
        <div className="rounded-xl border p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Stock availability feedback</p>{canEdit && <Button size="icon" variant="ghost" onClick={() => onEdit('stock_availability_feedback')} aria-label="Edit stock availability feedback"><Pencil className="h-4 w-4" /></Button>}</div><p className="mt-2 text-sm text-slate-600">{feedback?.notes || 'No feedback entered for this month.'}</p></div>
      </CardContent>
    </Card>
  );
}
