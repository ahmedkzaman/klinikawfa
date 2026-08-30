import { memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStockMovements, type InventoryTxType, type StockMovementRow } from '@/hooks/clinic/useProcurementStats';
import { QueryError } from './QueryError';
import { TX_BADGE } from './constants';
import { humanize, malaysiaDateTime } from './utils';

const LedgerTab = memo(function LedgerTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const typeFilter: InventoryTxType | 'all' = [
    'restock', 'dispense', 'adjustment', 'return', 'write-off', 'expire', 'owe_slip_fulfilled',
  ].includes(typeParam ?? '') ? typeParam as InventoryTxType : 'all';

  const movementsQuery = useStockMovements({
    limit: 200,
    type: typeFilter === 'all' ? null : typeFilter,
  });
  const { data: movements = [], isLoading: movLoading } = movementsQuery;

  const updateParam = (key: string, value: string, defaultValue?: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
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
                <MovementRow key={m.id} movement={m} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
});

const MovementRow = memo(function MovementRow({ movement: m }: { movement: StockMovementRow }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{malaysiaDateTime.format(new Date(m.created_at))}</TableCell>
      <TableCell className="font-medium">{m.inventory_item?.name ?? '—'}</TableCell>
      <TableCell><Badge className={TX_BADGE[m.transaction_type]}>{humanize(m.transaction_type)}</Badge></TableCell>
      <TableCell className={`text-right tabular-nums font-medium ${m.qty_change < 0 ? 'text-destructive' : 'text-success'}`}>
        {m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {[m.reason_code, m.notes].filter(Boolean).join(' · ') || '—'}
      </TableCell>
    </TableRow>
  );
});

export { LedgerTab };
