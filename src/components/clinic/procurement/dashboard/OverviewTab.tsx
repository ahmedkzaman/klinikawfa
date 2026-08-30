import { memo, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useProcurementStats, type MovementStatus, type InventoryMovementStat } from '@/hooks/clinic/useProcurementStats';
import { KpiCard } from './KpiCard';
import { QueryError } from './QueryError';
import { STATUS_BADGE, STATUS_LABEL } from './constants';
import { fmt } from './utils';

const OverviewTab = memo(function OverviewTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statsQuery = useProcurementStats();
  const { data: stats = [], isLoading: statsLoading } = statsQuery;

  const search = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status');
  const statusFilter: MovementStatus | 'all' = ['fast', 'normal', 'slow', 'dead'].includes(statusParam ?? '')
    ? statusParam as MovementStatus
    : 'all';

  const updateParam = (key: string, value: string, defaultValue?: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const filteredStats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.filter((r) => {
      if (statusFilter !== 'all' && r.movement_status !== statusFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stats, search, statusFilter]);

  const kpis = useMemo(() => ({
    total: stats.length,
    fast: stats.filter((s) => s.movement_status === 'fast').length,
    slowDead: stats.filter((s) => s.movement_status === 'slow' || s.movement_status === 'dead').length,
    critical: stats.filter((s) => s.reorder_level > 0 && s.current_stock <= s.reorder_level).length,
  }), [stats]);

  return (
    <div className="space-y-4">
      {statsQuery.isError && (
        <QueryError message="Inventory movement data could not be loaded." onRetry={() => void statsQuery.refetch()} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard icon={<Package className="h-4 w-4" />} label="Total active items" value={statsLoading ? null : kpis.total} />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-primary" />} label="Fast moving" value={statsLoading ? null : kpis.fast} />
        <KpiCard icon={<TrendingDown className="h-4 w-4 text-amber-600" />} label="Slow / dead" value={statsLoading ? null : kpis.slowDead} tone="amber" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Critical low stock" value={statsLoading ? null : kpis.critical} tone="destructive" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Inventory Movement</CardTitle>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Label htmlFor="movement-search" className="sr-only">Search inventory items</Label>
            <Input
              id="movement-search"
              placeholder="Search item…"
              value={search}
              onChange={(event) => updateParam('q', event.target.value)}
              className="w-full sm:w-52"
            />
            <Select value={statusFilter} onValueChange={(value) => updateParam('status', value, 'all')}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by movement status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="fast">Fast</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="slow">Slow</SelectItem>
                <SelectItem value="dead">Dead</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Used 30d</TableHead>
                  <TableHead className="text-right">Avg/day</TableHead>
                  <TableHead className="text-right" title="Estimated days until stock runs out at the current average usage">Days cover</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading inventory movement…</TableCell></TableRow>
                ) : statsQuery.isError ? null : filteredStats.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No items match these filters.</TableCell></TableRow>
                ) : filteredStats.map((r) => (
                  <InventoryRow key={r.item_id} item={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const InventoryRow = memo(function InventoryRow({ item }: { item: InventoryMovementStat }) {
  const critical = item.reorder_level > 0 && item.current_stock <= item.reorder_level;
  return (
    <TableRow>
      <TableCell className="font-medium">{item.name}</TableCell>
      <TableCell className={`text-right tabular-nums ${critical ? 'text-destructive font-semibold' : ''}`}>
        {fmt(Number(item.current_stock))}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmt(Number(item.used_30d))}</TableCell>
      <TableCell className="text-right tabular-nums">{Number(item.avg_daily_usage).toFixed(2)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {item.days_cover == null ? <span title="No usage recorded in the last 90 days">No usage</span> : Number(item.days_cover).toFixed(1)}
      </TableCell>
      <TableCell>
        <Badge className={STATUS_BADGE[item.movement_status]}>{STATUS_LABEL[item.movement_status]}</Badge>
      </TableCell>
    </TableRow>
  );
});

export { OverviewTab };
