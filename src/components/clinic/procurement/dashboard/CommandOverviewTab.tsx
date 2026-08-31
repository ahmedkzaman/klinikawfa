import { memo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  PackageCheck,
  ShieldAlert,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { QueryError } from './QueryError';
import { useProcurementDashboard } from '@/hooks/clinic/useProcurementDashboard';
import { BudgetDialog } from '../BudgetDialog';
import {
  budgetCategoryLabel,
  budgetCategoryList,
  sortProcurementActions,
  type BudgetCategory,
  type ProcurementAction,
  type ProcurementDashboardReport,
} from '@/lib/clinic/procurementDashboard';

const MAX_ACTIONS = 12;

function formatMYR(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
}

interface CommandOverviewTabProps {
  month: string;
  onMonthChange: (month: string) => void;
  onOpenPO: (poId: string) => void;
  onCreateOrder: () => void;
  canApprove: boolean;
}

function ActionRow({
  action,
  onOpenPO,
  onCreateOrder,
}: {
  action: ProcurementAction;
  onOpenPO: (poId: string) => void;
  onCreateOrder: () => void;
}) {
  const [acted, setActed] = useState(false);

  const run = () => {
    setActed(true);
    if (action.poId) {
      onOpenPO(action.poId);
    } else if (action.kind === 'stockout') {
      onCreateOrder();
    }
  };

  const label =
    action.kind === 'stockout'
      ? 'Create order'
      : action.kind === 'approval'
        ? 'Approve'
        : action.kind === 'overdue'
          ? 'Follow up'
          : action.kind === 'follow_up'
            ? 'Follow up'
            : 'Mark received';

  const kindTone =
    action.kind === 'stockout' || action.kind === 'overdue'
      ? 'text-destructive'
      : action.kind === 'expiry'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground';

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${kindTone}`}>{action.title}</p>
        {action.dueDate && (
          <p className="text-xs text-muted-foreground">Due {action.dueDate}</p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={run} disabled={acted} className="shrink-0">
        {label}
      </Button>
    </li>
  );
}

export const CommandOverviewTab = memo(function CommandOverviewTab({
  month,
  onMonthChange: _onMonthChange,
  onOpenPO,
  onCreateOrder,
  canApprove,
}: CommandOverviewTabProps) {
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const query = useProcurementDashboard(month);
  const report = query.data;

  if (query.isError) {
    return (
      <QueryError
        message={(query.error as Error | null)?.message ?? 'The procurement summary could not be loaded.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const counts = report?.counts;
  const totals = report?.totals;

  return (
    <div className="space-y-4">
      {/* KPI grid: wraps, no fixed widths */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock-out risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {counts == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold tabular-nums text-destructive">{counts.stockoutRisk}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting approval</CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {counts == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{counts.awaitingApproval}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Awaiting delivery</CardTitle>
            <Truck className="h-4 w-4" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {counts == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{counts.awaitingDelivery}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-destructive" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {counts == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold tabular-nums text-destructive">{counts.overdue}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expiring soon</CardTitle>
            <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {counts == null ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{counts.expiringSoon}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Budget section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Monthly budget</CardTitle>
            <p className="text-xs text-muted-foreground">{month}</p>
          </div>
          <div className="flex items-center gap-3">
            {totals && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                {formatMYR(totals.remaining)} remaining of {formatMYR(totals.budget)}
              </span>
            )}
            {canApprove && (
              <Button size="sm" variant="outline" onClick={() => setBudgetDialogOpen(true)}>
                Edit budget
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!report ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground">
                <span>Category</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Committed + Received</span>
                <span className="text-right">Remaining</span>
              </div>
              {(report.budgetRows ?? []).map((row) => (
                <div
                  key={row.category}
                  className="grid grid-cols-4 items-center gap-2 border-t pt-2 text-sm"
                >
                  <span className="font-medium">{budgetCategoryLabel(row.category)}</span>
                  <span className="text-right tabular-nums">{formatMYR(row.budget)}</span>
                  <span className="text-right tabular-nums">
                    {formatMYR(row.committed + row.received)}
                  </span>
                  <span
                    className={`text-right tabular-nums ${row.remaining < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatMYR(row.remaining)}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-4 items-center gap-2 border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="text-right tabular-nums">{formatMYR(totals?.budget ?? 0)}</span>
                <span className="text-right tabular-nums">
                  {formatMYR((totals?.committed ?? 0) + (totals?.received ?? 0))}
                </span>
                <span className="text-right tabular-nums">{formatMYR(totals?.remaining ?? 0)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Action centre */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Things to do</CardTitle>
          {report && (report.actions?.length ?? 0) > MAX_ACTIONS && (
            <Button size="sm" variant="ghost" onClick={() => onCreateOrder()} className="text-muted-foreground">
              View all
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!report ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (report.actions?.length ?? 0) === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {sortProcurementActions(report.actions ?? [])
                .slice(0, MAX_ACTIONS)
                .map((action) => (
                  <ActionRow key={action.id} action={action} onOpenPO={onOpenPO} onCreateOrder={onCreateOrder} />
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {report && (
        <BudgetDialog
          open={budgetDialogOpen}
          onOpenChange={setBudgetDialogOpen}
          month={month}
          currentBudgets={{
            medicines: (report.budgetRows ?? []).find((r) => r.category === 'medicines')?.budget ?? 0,
            consumables: (report.budgetRows ?? []).find((r) => r.category === 'consumables')?.budget ?? 0,
            vaccines: (report.budgetRows ?? []).find((r) => r.category === 'vaccines')?.budget ?? 0,
            other: (report.budgetRows ?? []).find((r) => r.category === 'other')?.budget ?? 0,
          }}
        />
      )}
    </div>
  );
});
