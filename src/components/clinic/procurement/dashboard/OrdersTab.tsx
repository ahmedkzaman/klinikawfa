import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePurchaseOrders, type POStatus } from '@/hooks/clinic/usePurchaseOrders';

const FILTERS: Array<{ key: 'open' | POStatus | 'all'; label: string }> = [
  { key: 'Draft', label: 'Draft' },
  { key: 'Awaiting approval', label: 'Awaiting approval' },
  { key: 'Ordered', label: 'Ordered' },
  { key: 'Received', label: 'Received' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

const OPEN_STATUSES: POStatus[] = ['Draft', 'Awaiting approval', 'Ordered'];

const statusVariant: Record<POStatus, string> = {
  Draft: 'bg-muted text-muted-foreground',
  'Awaiting approval': 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  Ordered: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  Received: 'bg-green-500/15 text-green-700 dark:text-green-400',
  Cancelled: 'bg-destructive/15 text-destructive',
};

function formatMYR(value: number) {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
}

interface OrdersTabProps {
  onOpenPO: (poId: string) => void;
  onAddPO: () => void;
}

export const OrdersTab = memo(function OrdersTab({ onOpenPO, onAddPO }: OrdersTabProps) {
  const [filter, setFilter] = useState<'open' | POStatus | 'all'>('open');
  const { orders, isLoading, createDraft } = usePurchaseOrders();

  const filtered = useMemo(() => {
    const rows = orders ?? [];
    if (filter === 'open') return rows.filter((o) => OPEN_STATUSES.includes(o.status));
    if (filter === 'all') return rows;
    return rows.filter((o) => o.status === filter);
  }, [orders, filter]);

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Order status filters">
          <Button
            size="sm"
            variant={filter === 'open' ? 'default' : 'outline'}
            onClick={() => setFilter('open')}
          >
            Open orders
          </Button>
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
          <div className="ml-auto flex items-center gap-2">
            <Link to="/clinic/procurement" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Manage suppliers &amp; invoices
            </Link>
            <Button size="sm" onClick={onAddPO} disabled={createDraft.isPending}>
              <Plus className="h-4 w-4 mr-1" /> New order
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No purchase orders match this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order date</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer"
                    onClick={() => onOpenPO(o.id)}
                  >
                    <TableCell className="font-medium">{o.po_number}</TableCell>
                    <TableCell>{o.supplier?.name ?? '—'}</TableCell>
                    <TableCell>{o.order_date ? format(new Date(o.order_date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell>
                      {o.expected_date ? format(new Date(o.expected_date), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMYR(Number(o.total_amount ?? 0))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.order_channel}</TableCell>
                    <TableCell>
                      <Badge className={statusVariant[o.status]}>{o.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
