import { useState } from 'react';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  bento,
  bentoHeader,
  pageInner,
  pageShell,
  pillTabActive,
  pillTabIdle,
  secondaryBtn,
} from '@/lib/clinic/bentoTokens';

import {
  usePanelClaims,
  usePanelClaimsSummary,
  PANEL_CLAIMS_PAGE_SIZE,
  type PanelClaimRow,
  type PanelClaimStatus,
  type PanelClaimsTab,
} from '@/hooks/clinic/usePanelClaims';

const TABS: Array<{ key: PanelClaimsTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatRM(value: number): string {
  return `RM ${value.toFixed(2)}`;
}

function StatusBadge({ status }: { status: PanelClaimStatus }) {
  const map: Record<PanelClaimStatus, string> = {
    pending: 'bg-amber-50 text-amber-700',
    submitted: 'bg-blue-50 text-blue-700',
    approved: 'bg-emerald-50 text-emerald-700',
    received: 'bg-teal-50 text-teal-700',
    rejected: 'bg-red-50 text-red-700',
    cancelled: 'bg-slate-50 text-slate-500',
  };
  return (
    <Badge
      className={cn(
        'capitalize rounded-full border-none font-semibold',
        map[status],
        `hover:${map[status]}`,
      )}
    >
      {status}
    </Badge>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', className)} />;
}

export default function PanelClaims() {
  const [tab, setTab] = useState<PanelClaimsTab>('all');
  const [page, setPage] = useState(0);

  const { data: claims, isLoading } = usePanelClaims(tab, page);
  const { data: summary } = usePanelClaimsSummary();

  const rows = claims?.rows ?? [];
  const total = claims?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PANEL_CLAIMS_PAGE_SIZE));

  const overdueCount = summary?.overdueCount ?? 0;

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Panel Claims</h1>
            {overdueCount > 0 && (
              <span className="rounded-full bg-red-50 text-red-700 px-3 py-1 text-xs font-semibold">
                {overdueCount} Overdue {overdueCount === 1 ? 'Claim' : 'Claims'}
              </span>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={cn(bento)}>
            <CardHeader className="pb-2">
              <h3 className={bentoHeader}>Submissions</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Pending
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-800 mt-1">
                    {summary?.pendingCount ?? 0}
                  </div>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                    Overdue
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-red-700 mt-1">
                    {summary?.overdueCount ?? 0}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cn(bento)}>
            <CardHeader className="pb-2">
              <h3 className={bentoHeader}>Payouts (RM)</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { label: 'Approved', dot: 'bg-emerald-500', val: summary?.approvedSum ?? 0 },
                  { label: 'Rejected', dot: 'bg-red-500', val: summary?.rejectedSum ?? 0 },
                  { label: 'Received', dot: 'bg-teal-500', val: summary?.receivedSum ?? 0 },
                  { label: 'Outstanding', dot: 'bg-amber-500', val: summary?.outstandingSum ?? 0 },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <Dot className={row.dot} />
                    <span className="text-slate-500">{row.label}</span>
                    <span className="ml-auto font-semibold tabular-nums text-slate-800">
                      {formatRM(row.val)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs + Table */}
        <Card className={cn(bento)}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => {
                const isActive = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      setPage(0);
                    }}
                    className={cn(isActive ? pillTabActive : pillTabIdle)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100">
                    {['Amount', 'Claim No', 'Panel', 'Patient', 'Status', 'Date', 'Updated By', 'Remarks'].map(
                      (h, i) => (
                        <TableHead
                          key={h}
                          className={cn(
                            'text-[11px] font-semibold text-slate-500 uppercase tracking-wider',
                            i === 0 && 'text-right',
                          )}
                        >
                          {h}
                        </TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-48">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <FileText className="h-10 w-10 opacity-40" />
                          <p className="text-sm">No claims in this view</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <ClaimRow key={row.id} row={row} activeTab={tab} />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="text-slate-500">
                  Page {page + 1} of {totalPages} · {total}{' '}
                  {total === 1 ? 'claim' : 'claims'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className={secondaryBtn}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    className={secondaryBtn}
                    onClick={() =>
                      setPage((p) => (p + 1 < totalPages ? p + 1 : p))
                    }
                    disabled={page + 1 >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClaimRow({
  row,
  activeTab,
}: {
  row: PanelClaimRow;
  activeTab: PanelClaimsTab;
}) {
  const displayAmount = row.received_amount ?? row.amount;
  const showClaimedSuffix =
    activeTab === 'received' &&
    row.received_amount !== null &&
    row.received_amount !== row.amount;

  const updatedBy =
    row.updater?.full_name ?? row.updater?.email ?? '—';

  let dateLabel = '—';
  try {
    dateLabel = format(new Date(row.claim_date), 'd MMM yyyy');
  } catch {
    dateLabel = row.claim_date;
  }

  return (
    <TableRow
      className={cn(
        'border-b border-slate-100 last:border-0 hover:bg-slate-50/60',
        row.is_overdue && 'bg-red-50/40 hover:bg-red-50/60',
      )}
    >
      <TableCell className="text-right tabular-nums font-semibold text-slate-800">
        {formatRM(displayAmount)}
        {showClaimedSuffix && (
          <span className="text-slate-400 ml-1 text-xs font-normal">
            (claimed: {formatRM(row.amount)})
          </span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-slate-700">{row.claim_no}</TableCell>
      <TableCell className="text-slate-700">{row.insurance_providers?.name ?? '—'}</TableCell>
      <TableCell className="text-slate-700">{row.patients?.name ?? '—'}</TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-slate-500">{dateLabel}</TableCell>
      <TableCell className="text-slate-500">{updatedBy}</TableCell>
      <TableCell
        className="max-w-[200px] line-clamp-1 text-slate-500"
        title={row.remarks ?? undefined}
      >
        {row.remarks ?? '—'}
      </TableCell>
    </TableRow>
  );
}
