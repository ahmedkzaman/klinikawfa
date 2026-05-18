import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
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
import {
  useProcurementStats,
  useStockMovements,
  useDiagnosisCorrelation,
  useRefreshCorrelation,
  useProcurementRecommendations,
  type RecommendationThresholds,
  type MovementStatus,
  type InventoryTxType,
} from '@/hooks/clinic/useProcurementStats';
import { ProcurementLogicSheet, type LogicSection } from '@/components/clinic/procurement/ProcurementLogicSheet';


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

  // Logic sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState<LogicSection>('correlation');

  const openSheet = (section: LogicSection) => {
    setSheetSection(section);
    setSheetOpen(true);
  };

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
          <TabsTrigger value="correlation">Diagnosis Correlation</TabsTrigger>
          <TabsTrigger value="planning">Purchase Planning</TabsTrigger>
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
          />
        </TabsContent>
      </Tabs>

      <ProcurementLogicSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultSection={sheetSection}
      />
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

/* ─────────────────────────── Tab 3: Diagnosis Correlation ─────────────────────────── */

const liftBadge = (lift: number | null) => {
  if (lift == null) return 'bg-muted text-muted-foreground';
  if (lift >= 2)   return 'bg-destructive/15 text-destructive';
  if (lift >= 1.5) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  if (lift >= 1)   return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
  return 'bg-muted text-muted-foreground';
};

function TrendArrow({ pct }: { pct: number | null }) {
  if (pct == null) return <Minus className="h-3 w-3 inline text-muted-foreground" />;
  if (pct > 0) return <ArrowUp className="h-3 w-3 inline text-destructive" />;
  if (pct < 0) return <ArrowDown className="h-3 w-3 inline text-emerald-600" />;
  return <Minus className="h-3 w-3 inline text-muted-foreground" />;
}

function CorrelationTab({
  onOpenLogic,
}: {
  onOpenLogic: () => void;
}) {
  const [hideLowLift, setHideLowLift] = useState(true);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const { data: rows = [], isLoading, dataUpdatedAt } = useDiagnosisCorrelation({
    minLift: hideLowLift ? 1.2 : 0,
    includeUnlinked,
  });
  const refresh = useRefreshCorrelation();

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
              <Switch id="lowlift" checked={hideLowLift} onCheckedChange={setHideLowLift} />
              <Label htmlFor="lowlift" className="text-sm">Hide low-lift (&lt;1.2)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="unlinked" checked={includeUnlinked} onCheckedChange={setIncludeUnlinked} />
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
                onError: (e: any) => toast.error(e?.message ?? 'Refresh failed'),
              })}
              disabled={refresh.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refresh.isPending ? 'animate-spin' : ''}`} />
              Refresh Now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
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

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Diagnosis Group</TableHead>
                  <TableHead className="text-right">Cases (Curr · Prev)</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Lift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No correlations available. Try unchecking "Hide low-lift" or click Refresh Now.</TableCell></TableRow>
                ) : rows.map((r) => {
                  const isUnlinked = r.diagnosis_group === '__UNLINKED__';
                  return (
                    <TableRow key={`${r.diagnosis_group}:${r.inventory_item_id}`} className={isUnlinked ? 'bg-muted/40' : ''}>
                      <TableCell className="font-medium">
                        {isUnlinked ? <span className="text-muted-foreground italic">Non-clinical / Unlinked</span> : r.diagnosis_group}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
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
}: {
  onOpenLogic: () => void;
}) {
  const { data, isLoading } = useProcurementRecommendations();
  const navigate = useNavigate();

  const draftPO = (itemId: string, qty: number) =>
    navigate(`/clinic/procurement?prefillItem=${itemId}&qty=${qty}`);

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
        <Button size="sm" variant="outline" onClick={() => navigate('/clinic/settings/procurement-rules')}>
          <Settings className="h-4 w-4 mr-2" /> Configure Rules
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
            title={`🚨 ${r.item_name}`}
            body={`${r.days_cover.toFixed(1)}d cover at ${r.avg_daily_usage.toFixed(2)}/day · ${r.current_stock} in stock. Reorder ~${r.suggested_qty} units.`}
            action={<Button size="sm" onClick={() => draftPO(r.item_id, r.suggested_qty)}>Create PO</Button>}
          />
        ))}
      </Section>

      <Section title="Seasonal Demand Surge" icon={<TrendingUp className="h-5 w-5 text-amber-600" />} count={surge.length}>
        {surge.length === 0 ? (
          <EmptyHint>No surge signals detected.</EmptyHint>
        ) : surge.map((r) => (
          <RecCard key={`${r.diagnosis_group}:${r.item_id}`} tone="amber"
            title={`📈 ${r.diagnosis_group} up ${r.trend_pct}%`}
            body={`High correlation to ${r.item_name} (Lift ${r.lift_score.toFixed(2)}). Cover ${r.days_cover}d — increase par level by ~${r.suggested_qty} units.`}
            action={<Button size="sm" variant="secondary" onClick={() => draftPO(r.item_id, r.suggested_qty)}>Create PO</Button>}
          />
        ))}
      </Section>

      <Section title="Overstock / Dead" icon={<Snowflake className="h-5 w-5 text-muted-foreground" />} count={overstock.length}>
        {overstock.length === 0 ? (
          <EmptyHint>No dead stock — clean shelves.</EmptyHint>
        ) : overstock.map((r) => (
          <RecCard key={r.item_id} tone="muted"
            title={`🧊 ${r.item_name}`}
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

function RecCard({ tone, title, body, action }: { tone: 'destructive' | 'amber' | 'muted'; title: string; body: string; action?: React.ReactNode }) {
  const border =
    tone === 'destructive' ? 'border-destructive/30 bg-destructive/5'
    : tone === 'amber'     ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-muted bg-muted/30';
  return (
    <div className={`rounded-md border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 ${border}`}>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{body}</div>
      </div>
      {action}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground py-2">{children}</div>;
}
