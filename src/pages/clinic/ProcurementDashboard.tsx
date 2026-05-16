import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Activity, AlertTriangle, Package, TrendingUp, TrendingDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useProcurementStats,
  useStockMovements,
  type MovementStatus,
  type InventoryTxType,
} from '@/hooks/clinic/useProcurementStats';

const statusBadge: Record<MovementStatus, string> = {
  fast:   'bg-destructive/15 text-destructive',
  normal: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  slow:   'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  dead:   'bg-muted text-muted-foreground',
};

const statusLabel: Record<MovementStatus, string> = {
  fast: 'Fast', normal: 'Normal', slow: 'Slow', dead: 'Dead',
};

const txBadge: Record<InventoryTxType, string> = {
  restock:             'bg-green-500/15 text-green-700 dark:text-green-400',
  dispense:            'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  adjustment:          'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  return:              'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'write-off':         'bg-destructive/15 text-destructive',
  expire:              'bg-destructive/15 text-destructive',
  owe_slip_fulfilled:  'bg-purple-500/15 text-purple-700 dark:text-purple-400',
};

const fmt = (n: number) => Number.isFinite(n) ? n.toLocaleString() : '—';

export default function ProcurementDashboard() {
  const { data: stats = [], isLoading: statsLoading } = useProcurementStats();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MovementStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.filter((r) => {
      if (statusFilter !== 'all' && r.movement_status !== statusFilter) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stats, search, statusFilter]);

  const kpis = useMemo(() => ({
    total:    stats.length,
    fast:     stats.filter((s) => s.movement_status === 'fast').length,
    slowDead: stats.filter((s) => s.movement_status === 'slow' || s.movement_status === 'dead').length,
    critical: stats.filter((s) => s.reorder_level > 0 && s.current_stock <= s.reorder_level).length,
  }), [stats]);

  // Movements tab
  const [typeFilter, setTypeFilter] = useState<InventoryTxType | 'all'>('all');
  const { data: movements = [], isLoading: movLoading } = useStockMovements({
    limit: 200,
    type: typeFilter === 'all' ? null : typeFilter,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" /> Procurement Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Live movement classification driven by the dispensing ledger.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Movement Ledger</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<Package className="h-4 w-4" />} label="Total Active Items"    value={kpis.total} />
            <KpiCard icon={<TrendingUp className="h-4 w-4 text-destructive" />} label="Fast Moving" value={kpis.fast} tone="destructive" />
            <KpiCard icon={<TrendingDown className="h-4 w-4 text-amber-600" />} label="Slow / Dead" value={kpis.slowDead} tone="amber" />
            <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Critical Low Stock" value={kpis.critical} tone="destructive" />
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Inventory Movement</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="Search item…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-48"
                />
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MovementStatus | 'all')}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Used 30d</TableHead>
                      <TableHead className="text-right">Used 90d</TableHead>
                      <TableHead className="text-right">Avg/day</TableHead>
                      <TableHead className="text-right">Days Cover</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statsLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No items match.</TableCell></TableRow>
                    ) : filtered.map((r) => {
                      const critical = r.reorder_level > 0 && r.current_stock <= r.reorder_level;
                      return (
                        <TableRow key={r.item_id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className={`text-right tabular-nums ${critical ? 'text-destructive font-semibold' : ''}`}>
                            {fmt(Number(r.current_stock))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(Number(r.used_30d))}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(Number(r.used_90d))}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(r.avg_daily_usage).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.days_cover == null ? '∞' : Number(r.days_cover).toFixed(1)}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusBadge[r.movement_status]}>{statusLabel[r.movement_status]}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEDGER */}
        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Movement Ledger</CardTitle>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as InventoryTxType | 'all')}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="dispense">Dispense</SelectItem>
                  <SelectItem value="restock">Restock</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                  <SelectItem value="write-off">Write-off</SelectItem>
                  <SelectItem value="expire">Expire</SelectItem>
                  <SelectItem value="owe_slip_fulfilled">Owe slip fulfilled</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason / Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : movements.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No movements yet.</TableCell></TableRow>
                    ) : movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(m.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                        <TableCell className="font-medium">{m.inventory_item?.name ?? '—'}</TableCell>
                        <TableCell><Badge className={txBadge[m.transaction_type]}>{m.transaction_type}</Badge></TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${m.qty_change < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                          {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {[m.reason_code, m.notes].filter(Boolean).join(' · ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'destructive' | 'amber' }) {
  const valueClass = tone === 'destructive' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : '';
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold tabular-nums ${valueClass}`}>{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
