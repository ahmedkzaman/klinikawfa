import { memo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, ArrowDown, ArrowUp, Info, Minus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDiagnosisCorrelation, useRefreshCorrelation, type DiagnosisCorrelationRow } from '@/hooks/clinic/useProcurementStats';
import { QueryError } from './QueryError';

const liftBadge = (lift: number | null) => {
  if (lift == null) return 'bg-muted text-muted-foreground';
  if (lift >= 2) return 'bg-success/15 text-success';
  if (lift >= 1.5) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  if (lift >= 1) return 'bg-blue-500/15 text-blue-700 dark:text-blue-400';
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

const CorrelationTab = memo(function CorrelationTab({ onOpenLogic }: { onOpenLogic: () => void }) {
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
                ) : rows.map((r) => (
                  <CorrelationRow key={`${r.diagnosis_group}:${r.inventory_item_id}`} row={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const CorrelationRow = memo(function CorrelationRow({ row: r }: { row: DiagnosisCorrelationRow }) {
  const isUnlinked = r.diagnosis_group === '__UNLINKED__';
  return (
    <TableRow className={isUnlinked ? 'bg-muted/40' : ''}>
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
});

export { CorrelationTab };
