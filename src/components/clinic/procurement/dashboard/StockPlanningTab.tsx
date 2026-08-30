import { memo, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryError } from './QueryError';
import {
  useProcurementStockPlanning,
  useDiagnosisCorrelation,
  type DiagnosisCorrelationRow,
} from '@/hooks/clinic/useProcurementStats';
import type { StockPlanningRow } from '@/lib/clinic/procurementDashboard';

type Filter = 'all' | 'low' | 'overstock' | 'expiring';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'Low stock' },
  { key: 'overstock', label: 'Overstock' },
  { key: 'expiring', label: 'Expiring within 90 days' },
];

function isExpiringWithin(row: StockPlanningRow, days: number): boolean {
  if (!row.nearest_expiry_date) return false;
  const expiry = new Date(`${row.nearest_expiry_date}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (expiry.getTime() - today.getTime()) / 86400000;
  return diffDays >= 0 && diffDays <= days;
}

interface StockPlanningTabProps {
  onDraftPO: (itemId: string, suggestedQty: number) => void;
  draftingItemId: string | null;
}

export const StockPlanningTab = memo(function StockPlanningTab({
  onDraftPO,
  draftingItemId,
}: StockPlanningTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const planning = useProcurementStockPlanning();
  const correlation = useDiagnosisCorrelation();

  const surgeItemIds = useMemo(() => {
    const rows = (correlation.data ?? []) as DiagnosisCorrelationRow[];
    return new Set(
      rows
        .filter((c) => (c.case_trend_pct ?? 0) > 20 && (c.lift_score ?? 0) > 1.5)
        .map((c) => c.inventory_item_id),
    );
  }, [correlation.data]);

  const rows = planning.data ?? [];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      switch (filter) {
        case 'low':
          return r.current_stock <= r.reorder_level;
        case 'overstock':
          return r.movement_status === 'dead' && r.current_stock > 0;
        case 'expiring':
          return isExpiringWithin(r, 90);
        default:
          return true;
      }
    });
  }, [rows, filter]);

  if (planning.isError) {
    return (
      <QueryError
        message={(planning.error as Error | null)?.message ?? 'Stock planning data could not be loaded.'}
        onRetry={() => void planning.refetch()}
      />
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Stock filters">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {planning.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No items match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Current stock</TableHead>
                  <TableHead className="text-right">Recent usage</TableHead>
                  <TableHead className="text-right">Days remaining</TableHead>
                  <TableHead className="text-right">On order</TableHead>
                  <TableHead className="text-right">Suggested order</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const actionable = r.current_stock <= r.reorder_level;
                  const surge = surgeItemIds.has(r.item_id);
                  return (
                    <TableRow
                      key={r.item_id}
                      className={actionable ? 'bg-destructive/5' : undefined}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.name}</span>
                          {surge && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              Seasonal surge
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{r.recommendation_reason}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.current_stock}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.used_30d}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.days_cover == null ? '—' : Number(r.days_cover).toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.open_order_qty}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.suggested_qty == null ? '—' : r.suggested_qty}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={actionable ? 'default' : 'outline'}
                          disabled={r.suggested_qty == null || draftingItemId === r.item_id}
                          onClick={() => onDraftPO(r.item_id, r.suggested_qty as number)}
                        >
                          Create order
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
