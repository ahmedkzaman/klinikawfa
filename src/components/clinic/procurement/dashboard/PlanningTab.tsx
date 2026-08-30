import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Info, Settings, Snowflake, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useProcurementRecommendations } from '@/hooks/clinic/useProcurementStats';
import { QueryError } from './QueryError';

interface PlanningTabProps {
  onOpenLogic: () => void;
  onDraftPO: (itemId: string, qty: number) => Promise<void>;
  draftingItemId: string | null;
}

const PlanningTab = memo(function PlanningTab({ onOpenLogic, onDraftPO, draftingItemId }: PlanningTabProps) {
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
});

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
    : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5'
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

export { PlanningTab };
