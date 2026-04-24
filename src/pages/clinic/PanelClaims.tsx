import { useState } from 'react';
import { format } from 'date-fns';
import { FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  if (status === 'rejected') {
    return <Badge variant="destructive" className="capitalize">{status}</Badge>;
  }
  const map: Record<Exclude<PanelClaimStatus, 'rejected'>, string> = {
    pending: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    submitted: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    approved: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    received: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    cancelled: 'bg-muted text-muted-foreground hover:bg-muted',
  };
  return (
    <Badge
      variant="secondary"
      className={cn('capitalize border-transparent', map[status])}
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

  const handleTabChange = (next: string) => {
    setTab(next as PanelClaimsTab);
    setPage(0);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Panel Claims</h1>
          {overdueCount > 0 && (
            <span className="text-destructive font-semibold text-sm">
              {overdueCount} Overdue {overdueCount === 1 ? 'Claim' : 'Claims'}
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {summary?.pendingCount ?? 0}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className="text-2xl font-semibold tabular-nums text-destructive">
                  {summary?.overdueCount ?? 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payouts (RM)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Dot className="bg-emerald-500" />
                <span className="text-muted-foreground">Approved</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatRM(summary?.approvedSum ?? 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Dot className="bg-red-500" />
                <span className="text-muted-foreground">Rejected</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatRM(summary?.rejectedSum ?? 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Dot className="bg-teal-500" />
                <span className="text-muted-foreground">Received</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatRM(summary?.receivedSum ?? 0)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Dot className="bg-amber-500" />
                <span className="text-muted-foreground">Outstanding</span>
                <span className="ml-auto font-semibold tabular-nums">
                  {formatRM(summary?.outstandingSum ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Card>
        <CardHeader className="pb-3">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList className="flex flex-wrap h-auto">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Claim No</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Updated By</TableHead>
                  <TableHead>Remarks</TableHead>
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
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
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

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {page + 1} of {totalPages} · {total}{' '}
                {total === 1 ? 'claim' : 'claims'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
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
      className={
        row.is_overdue ? 'bg-destructive/10 hover:bg-destructive/20' : ''
      }
    >
      <TableCell className="text-right tabular-nums font-medium">
        {formatRM(displayAmount)}
        {showClaimedSuffix && (
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            (claimed: {formatRM(row.amount)})
          </span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{row.claim_no}</TableCell>
      <TableCell>{row.insurance_providers?.name ?? '—'}</TableCell>
      <TableCell>{row.patients?.name ?? '—'}</TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">{dateLabel}</TableCell>
      <TableCell className="text-muted-foreground">{updatedBy}</TableCell>
      <TableCell
        className="max-w-[200px] line-clamp-1 text-muted-foreground"
        title={row.remarks ?? undefined}
      >
        {row.remarks ?? '—'}
      </TableCell>
    </TableRow>
  );
}
