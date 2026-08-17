import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SalesInsightRow } from '@/hooks/clinic/useSalesInsights';
import { clinicDateKey, financeCollectionKey, type FinanceCollectionKey } from '@/lib/clinic/insight/financeSections';

const PrintReceiptDialog = lazy(async () => {
  const module = await import('@/components/clinic/billing/PrintReceiptDialog');
  return { default: module.PrintReceiptDialog };
});

const LABELS: Record<FinanceCollectionKey, string> = {
  card: 'Card', qr_pay: 'QR Pay', cash: 'Cash', e_wallet: 'E-wallet', other: 'Other',
};

function money(value: number): string {
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CollectionDetailSheet({
  collection,
  rows,
  onClose,
}: {
  collection: FinanceCollectionKey | null;
  rows: SalesInsightRow[];
  onClose: () => void;
}) {
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const matchingRows = useMemo(
    () => collection ? rows.filter((row) => financeCollectionKey(row.paymentMethod) === collection) : [],
    [collection, rows],
  );
  const label = collection ? LABELS[collection] : 'Patient';

  useLayoutEffect(() => {
    if (collection !== null) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [collection]);

  return (
    <>
      <Sheet open={collection !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{label} collections</SheetTitle>
            <SheetDescription>Physical patient-payment rows for this method. Panel allocation markers are excluded.</SheetDescription>
          </SheetHeader>
          {matchingRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No {label.toLowerCase()} payments in this period.</p>
          ) : (
            <Table className="mt-4" aria-label={`${label} payment rows`}>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Records</TableHead></TableRow></TableHeader>
              <TableBody>
                {matchingRows.map((row) => (
                  <TableRow key={row.paymentId}>
                    <TableCell>{clinicDateKey(row.createdAt) ?? 'Unavailable'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.paymentId}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {row.queueEntryId ? <a className="text-xs font-medium text-blue-700 hover:underline" href={`/clinic/visits/${row.queueEntryId}`}>Visit</a> : null}
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" aria-label={`Open receipt ${row.paymentId}`} onClick={() => setReceiptPaymentId(row.paymentId)}>Receipt</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SheetContent>
      </Sheet>
      {receiptPaymentId ? (
        <Suspense fallback={null}>
          <PrintReceiptDialog open onOpenChange={(open) => { if (!open) setReceiptPaymentId(null); }} paymentId={receiptPaymentId} />
        </Suspense>
      ) : null}
    </>
  );
}
