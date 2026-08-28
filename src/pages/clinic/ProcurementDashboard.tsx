import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, Info, Minus, Package, RefreshCw,
  Settings, Snowflake, TrendingUp, TrendingDown, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useProcurementStats,
  useStockMovements,
  useDiagnosisCorrelation,
  useRefreshCorrelation,
  useProcurementRecommendations,
  type MovementStatus,
  type InventoryTxType,
} from '@/hooks/clinic/useProcurementStats';
import { ProcurementLogicSheet, type LogicSection } from '@/components/clinic/procurement/ProcurementLogicSheet';
import { POSheet } from '@/components/clinic/procurement/POSheet';
import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';


const statusBadge: Record<MovementStatus, string> = {
  fast:   'bg-primary/15 text-primary',
  normal: 'bg-secondary text-secondary-foreground',
  slow:   'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  dead:   'bg-muted text-muted-foreground',
};

const statusLabel: Record<MovementStatus, string> = {
  fast: 'Fast', normal: 'Normal', slow: 'Slow', dead: 'Dead',
};

const txBadge: Record<InventoryTxType, string> = {
  restock:             'bg-success/15 text-success',
  dispense:            'bg-primary/15 text-primary',
  adjustment:          'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  return:              'bg-success/15 text-success',
  'write-off':         'bg-destructive/15 text-destructive',
  expire:              'bg-destructive/15 text-destructive',
  owe_slip_fulfilled:  'bg-purple-500/15 text-purple-700 dark:text-purple-400',
};

const fmt = (n: number) => Number.isFinite(n) ? n.toLocaleString() : '—';
const dashboardTabs = ['planning', 'overview', 'ledger', 'correlation'] as const;
type DashboardTab = typeof dashboardTabs[number];

const malaysiaDateTime = new Intl.DateTimeFormat('en-MY', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Kuala_Lumpur',
});

const humanize = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

export default function ProcurementDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statsQuery = useProcurementStats();
  const { data: stats = [], isLoading: statsLoading } = statsQuery;
  const tabParam = searchParams.get('tab');
  const activeTab: DashboardTab = dashboardTabs.includes(tabParam as DashboardTab)
    ? tabParam as DashboardTab
    : 'planning';
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
  const typeParam = searchParams.get('type');
  const typeFilter: InventoryTxType | 'all' = [
    'restock', 'dispense', 'adjustment', 'return', 'write-off', 'expire', 'owe_slip_fulfilled',
  ].includes(typeParam ?? '') ? typeParam as InventoryTxType : 'all';
  const movementsQuery = useStockMovements({
    limit: 200,
    type: typeFilter === 'all' ? null : typeFilter,
  });
  const { data: movements = [], isLoading: movLoading } = movementsQuery;

  // Logic sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState<LogicSection>('correlation');
  const [poSheet, setPOSheet] = useState<{ open: boolean; poId: string | null }>({ open: false, poId: null });
  const [draftingItemId, setDraftingItemId] = useState<string | null>(null);
  const { suppliers } = useSuppliers();
  const { createDraft } = usePurchaseOrders();

  const openSheet = (section: LogicSection) => {
    setSheetSection(section);
    setSheetOpen(true);
  };

  const draftRecommendedPO = async (itemId: string, qty: number) => {
    if (!suppliers.some((supplier) => supplier.status === 'active')) {
      toast.error('Add an active supplier before creating a purchase order.');
      return;
    }
    setDraftingItemId(itemId);
    try {
      const draft = await createDraft.mutateAsync({ inventory_item_id: itemId, order_qty: qty });
      setPOSheet({ open: true, poId: draft.id });
      toast.success('Draft PO created with the recommended item and quantity.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not create the draft PO.');
    } finally {
      setDraftingItemId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-[1400px] py-4 sm:py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" /> Procurement Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Live movement classification driven by the dispensing ledger.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => updateParam('tab', value, 'planning')} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="planning">Purchase Planning</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ledger">Movement Ledger</TabsTrigger>
            <TabsTrigger value="correlation">Diagnosis Correlation</TabsTrigger>
          </TabsList>
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
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
                    ) : statsQuery.isError ? null : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No items match these filters.</TableCell></TableRow>
                    ) : filtered.map((r) => {
                      const critical = r.reorder_level > 0 && r.current_stock <= r.reorder_level;
                      return (
                        <TableRow key={r.item_id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className={`text-right tabular-nums ${critical ? 'text-destructive font-semibold' : ''}`}>
                            {fmt(Number(r.current_stock))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(Number(r.used_30d))}</TableCell>
                          <TableCell className="text-right tabular-nums">{Number(r.avg_daily_usage).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.days_cover == null ? <span title="No usage recorded in the last 90 days">No usage</span> : Number(r.days_cover).toFixed(1)}
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
              <Select value={typeFilter} onValueChange={(value) => updateParam('type', value, 'all')}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filter movement ledger by transaction type"><SelectValue /></SelectTrigger>
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
            <CardContent className="space-y-3">
              {movementsQuery.isError && (
                <QueryError message="The movement ledger could not be loaded." onRetry={() => void movementsQuery.refetch()} />
              )}
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[720px]">
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
                    ) : movementsQuery.isError ? null : movements.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No movements yet.</TableCell></TableRow>
                    ) : movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{malaysiaDateTime.format(new Date(m.created_at))}</TableCell>
                        <TableCell className="font-medium">{m.inventory_item?.name ?? '—'}</TableCell>
                        <TableCell><Badge className={txBadge[m.transaction_type]}>{humanize(m.transaction_type)}</Badge></TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${m.qty_change < 0 ? 'text-destructive' : 'text-success'}`}>
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

        {/* CORRELATION */}
        <TabsContent value="correlation">
          <CorrelationTab
            onOpenLogic={() => openSheet('correlation')}
          />
        </TabsContent>

        {/* PLANNING */}
        <TabsContent value="planning">
          <PlanningTab
            onOpenLogic={() => openSheet('planning')}
            onDraftPO={draftRecommendedPO}
            draftingItemId={draftingItemId}
          />
        </TabsContent>
      </Tabs>

      <ProcurementLogicSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultSection={sheetSection}
      />
      <POSheet
        open={poSheet.open}
        poId={poSheet.poId}
        onOpenChange={(open) => setPOSheet({ open, poId: open ? poSheet.poId : null })}
      />
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | null; tone?: 'destructive' | 'amber' }) {
  const valueClass = tone === 'destructive' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : '';
  return (
    <Card aria-label={value == null ? `${label}: loading` : `${label}: ${value.toLocaleString()}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span aria-hidden="true">{icon}</span>
      </CardHeader>
      <CardContent>
        {value == null
          ? <Skeleton className="h-9 w-16" aria-hidden="true" />
          : <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${valueClass}`}>{value.toLocaleString()}</div>}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── Tab 3: Diagnosis Correlation ─────────────────────────── */

const liftBadge = (lift: number | null) => {
  if (lift == null) return 'bg-muted text-muted-foreground';
  if (lift >= 2)   return 'bg-success/15 text-success';
  if (lift >= 1.5) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  if (lift >= 1)   return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
  return 'bg-muted text-muted-foreground';
};

function TrendArrow({ pct }: { pct: number | null }) {
  const label = pct == null ? 'Trend unavailable' : pct > 0 ? 'Increasing' : pct < 0 ? 'Decreasing' : 'No change';
  const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? ArrowUp : ArrowDown;
  return (
    <span aria-label={label}>
      <Icon aria-hidden="true" className={`h-3 w-3 inline ${pct && pct > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
    </span>
  );
}

function CorrelationTab({
  onOpenLogic,
}: {
  onOpenLogic: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hideLowLift = searchParams.get('lift') !== 'all';
  const includeUnlinked = searchParams.get('unlinked') === '1';
  const query = useDiagnosisCorrelation({ minLift: hideLowLift ? 1.2 : 0, includeUnlinked });
  const { data: rows = [], isLoading, dataUpdatedAt } = query;
  const refresh = useRefreshCorrelation();
  const setFilter = (key: string, enabled: boolean, enabledValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (enabled) next.set(key, enabledValue);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const uncategorized = rows.filter((r) => r.diagnosis_group === 'Uncategorized').length;
  const lastRefreshed = rows[0]?.last_refreshed_at
    ? formatDistanceToNow(new Date(rows[0].last_refreshed_at), { addSuffix: true })
    : dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : '—';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Diagnosis ↔ Inventory Correlation</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Last refreshed {lastRefreshed} · 90-day window</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch id="lowlift" checked={hideLowLift} onCheckedChange={(checked) => setFilter('lift', !checked, 'all')} />
              <Label htmlFor="lowlift" className="text-sm">Hide low-lift (&lt;1.2)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="unlinked" checked={includeUnlinked} onCheckedChange={(checked) => setFilter('unlinked', checked, '1')} />
              <Label htmlFor="unlinked" className="text-sm">Include unlinked usage</Label>
            </div>
            <Button size="sm" variant="ghost" onClick={onOpenLogic}>
              <Info className="h-4 w-4 mr-2" />
              How is this calculated?
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refresh.mutate(undefined, {
                onSuccess: () => toast.success('Correlation refreshed'),
                onError: (error) => toast.error(error instanceof Error ? error.message : 'Refresh failed'),
              })}
              disabled={refresh.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refresh.isPending ? 'animate-spin' : ''}`} />
              Refresh Now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isError && (
            <QueryError message="Diagnosis correlations could not be loaded." onRetry={() => void query.refetch()} />
          )}
          {uncategorized > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Ungrouped diagnoses detected</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{uncategorized} row(s) fall under "Uncategorized". Curate them in the Diagnosis Sweeper for sharper insights.</span>
                <Button asChild size="sm" variant="link"><Link to="/clinic/settings/diagnoses">Open Sweeper</Link></Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Diagnosis Group</TableHead>
                  <TableHead className="text-right">Cases (current / previous)</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Lift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : query.isError ? null : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No correlations available. Try unchecking "Hide low-lift" or click Refresh Now.</TableCell></TableRow>
                ) : rows.map((r) => {
                  const isUnlinked = r.diagnosis_group === '__UNLINKED__';
                  return (
                    <TableRow key={`${r.diagnosis_group}:${r.inventory_item_id}`} className={isUnlinked ? 'bg-muted/40' : ''}>
                      <TableCell className="font-medium">
                        {isUnlinked ? <span className="text-muted-foreground italic">Non-clinical / Unlinked</span> : r.diagnosis_group}
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        aria-label={`${r.case_count_current_month} current month cases, ${r.case_count_prior_month} previous month cases`}
                      >
                        {r.case_count_current_month} · {r.case_count_prior_month}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <TrendArrow pct={r.case_trend_pct} />{' '}
                        {r.case_trend_pct == null ? '—' : `${r.case_trend_pct > 0 ? '+' : ''}${r.case_trend_pct}%`}
                      </TableCell>
                      <TableCell>{r.item_name ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.confidence_pct == null ? '—' : `${r.confidence_pct}%`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={liftBadge(r.lift_score)}>
                          {r.lift_score == null ? '—' : Number(r.lift_score).toFixed(2)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Tab 4: Purchase Planning ─────────────────────────── */

function PlanningTab({
  onOpenLogic,
  onDraftPO,
  draftingItemId,
}: {
  onOpenLogic: () => void;
  onDraftPO: (itemId: string, qty: number) => Promise<void>;
  draftingItemId: string | null;
}) {
  const { data, isLoading, isError, error, refetch } = useProcurementRecommendations();

  const header = (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold">Purchase Planning</h2>
        <p className="text-xs text-muted-foreground">
          Deterministic rules driven by global clinic settings.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={onOpenLogic}>
          <Info className="h-4 w-4 mr-2" /> How is this calculated?
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/clinic/settings/procurement-rules">
            <Settings className="h-4 w-4 mr-2" /> Configure Rules
          </Link>
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <Card><CardContent className="py-10 text-center text-muted-foreground">Crunching recommendations…</CardContent></Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        {header}
        <QueryError message={error?.message || 'Purchase recommendations could not be loaded.'} onRetry={refetch} />
      </div>
    );
  }

  const { urgent, surge, overstock } = data;
  const empty = urgent.length === 0 && surge.length === 0 && overstock.length === 0;

  return (
    <div className="space-y-4">
      {header}

      {empty ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No actionable recommendations right now. Stock looks healthy.</CardContent></Card>
      ) : (
        <div className="space-y-6">
      <Section title="Urgent Reorder" icon={<Zap className="h-5 w-5 text-destructive" />} count={urgent.length}>
        {urgent.length === 0 ? (
          <EmptyHint>No urgent reorders.</EmptyHint>
        ) : urgent.map((r) => (
          <RecCard key={r.item_id} tone="destructive"
            icon={<Zap className="h-4 w-4 text-destructive" />}
            title={r.item_name}
            body={`${r.days_cover.toFixed(1)}d cover at ${r.avg_daily_usage.toFixed(2)}/day · ${r.current_stock} in stock. Reorder ~${r.suggested_qty} units.`}
            action={<Button size="sm" onClick={() => void onDraftPO(r.item_id, r.suggested_qty)} disabled={draftingItemId !== null}>{draftingItemId === r.item_id ? 'Creating draft…' : 'Create PO'}</Button>}
          />
        ))}
      </Section>

      <Section title="Seasonal Demand Surge" icon={<TrendingUp className="h-5 w-5 text-amber-600" />} count={surge.length}>
        {surge.length === 0 ? (
          <EmptyHint>No surge signals detected.</EmptyHint>
        ) : surge.map((r) => (
          <RecCard key={`${r.diagnosis_group}:${r.item_id}`} tone="amber"
            icon={<TrendingUp className="h-4 w-4 text-amber-600" />}
            title={`${r.diagnosis_group} up ${r.trend_pct}%`}
            body={`High correlation to ${r.item_name} (Lift ${r.lift_score.toFixed(2)}). Cover ${r.days_cover}d — increase par level by ~${r.suggested_qty} units.`}
            action={<Button size="sm" variant="secondary" onClick={() => void onDraftPO(r.item_id, r.suggested_qty)} disabled={draftingItemId !== null}>{draftingItemId === r.item_id ? 'Creating draft…' : 'Create PO'}</Button>}
          />
        ))}
      </Section>

      <Section title="Overstock / Dead" icon={<Snowflake className="h-5 w-5 text-muted-foreground" />} count={overstock.length}>
        {overstock.length === 0 ? (
          <EmptyHint>No dead stock — clean shelves.</EmptyHint>
        ) : overstock.map((r) => (
          <RecCard key={r.item_id} tone="muted"
            icon={<Snowflake className="h-4 w-4 text-muted-foreground" />}
            title={r.item_name}
            body={`Dead (0 usage in 90 days) but ${r.current_stock} units on hand. Halt reordering and monitor expiry.`}
          />
        ))}
      </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function RecCard({ tone, icon, title, body, action }: { tone: 'destructive' | 'amber' | 'muted'; icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  const border =
    tone === 'destructive' ? 'border-destructive/30 bg-destructive/5'
    : tone === 'amber'     ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-muted bg-muted/30';
  return (
    <div className={`rounded-md border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${border}`}>
      <div>
        <div className="font-semibold flex items-center gap-2"><span aria-hidden="true">{icon}</span>{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{body}</div>
      </div>
      {action && <div className="shrink-0 sm:self-center">{action}</div>}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground py-2">{children}</div>;
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Data unavailable</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{message}</span>
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </AlertDescription>
    </Alert>
  );
}
