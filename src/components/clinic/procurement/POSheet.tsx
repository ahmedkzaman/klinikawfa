import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Send, Printer } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';
import { usePurchaseOrder, usePurchaseOrders, type POStatus } from '@/hooks/clinic/usePurchaseOrders';
import { POLineItemsTable } from './POLineItemsTable';
import { POPrintTemplate } from './POPrintTemplate';
import { toast } from 'sonner';

interface Props {
  poId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusVariant: Record<POStatus, { className: string; label: string }> = {
  Draft:     { className: 'bg-muted text-muted-foreground', label: 'Draft' },
  Sent:      { className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Sent' },
  Received:  { className: 'bg-green-500/15 text-green-700 dark:text-green-400', label: 'Received' },
  Cancelled: { className: 'bg-destructive/15 text-destructive', label: 'Cancelled' },
};

export function POSheet({ poId, open, onOpenChange }: Props) {
  const { data: po, isLoading } = usePurchaseOrder(open ? poId : null);
  const { suppliers } = useSuppliers();
  const { updateHeader, setStatus, receiveGoods } = usePurchaseOrders();
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [supplierId, setSupplierId] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (po) {
      setSupplierId(po.supplier_id);
      setOrderDate(po.order_date ?? '');
      setExpectedDate(po.expected_date ?? '');
      setNotes(po.notes ?? '');
    }
  }, [po]);

  const status = (po?.status ?? 'Draft') as POStatus;
  const readOnly = status === 'Received' || status === 'Cancelled';
  const supplier = suppliers.find((s) => s.id === (po?.supplier_id ?? supplierId)) ?? null;
  const total = (po?.items ?? []).reduce((s, l) => s + Number(l.total_price ?? 0), 0);

  const persistHeader = async () => {
    if (!po) return;
    try {
      await updateHeader.mutateAsync({
        id: po.id,
        supplier_id: supplierId,
        order_date: orderDate || undefined,
        expected_date: expectedDate || null,
        notes: notes || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onMarkSent = async () => {
    if (!po) return;
    if (!po.items.length) {
      toast.error('Add at least one line item before sending.');
      return;
    }
    if (!supplierId) {
      toast.error('Select a supplier first.');
      return;
    }
    await persistHeader();
    try {
      await setStatus.mutateAsync({ id: po.id, status: 'Sent' });
      toast.success(`PO ${po.po_number} marked as Sent`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onReceive = async () => {
    if (!po) return;
    try {
      await receiveGoods.mutateAsync(po.id);
      toast.success('Goods received and stock updated');
      setConfirmReceive(false);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onCancel = async () => {
    if (!po) return;
    try {
      await setStatus.mutateAsync({ id: po.id, status: 'Cancelled' });
      toast.success('PO cancelled');
      setConfirmCancel(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <SheetTitle>{po?.po_number ?? 'Purchase Order'}</SheetTitle>
                <SheetDescription>
                  Create or manage a purchase order. Goods received here update inventory stock.
                </SheetDescription>
              </div>
              <Badge className={statusVariant[status].className}>{statusVariant[status].label}</Badge>
            </div>
          </SheetHeader>

          {isLoading || !po ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Header */}
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Supplier</Label>
                  <Select
                    value={supplierId}
                    onValueChange={(v) => setSupplierId(v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers
                        .filter((s) => s.status === 'active' || s.id === supplierId)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Order Date</Label>
                    <Input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      onBlur={persistHeader}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Expected Date</Label>
                    <Input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      onBlur={persistHeader}
                      disabled={readOnly}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={persistHeader}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <Separator />

              {/* Line items */}
              <div className="space-y-2">
                <h3 className="font-semibold">Line Items</h3>
                <POLineItemsTable poId={po.id} items={po.items} readOnly={readOnly} />
              </div>

              {/* Footer totals */}
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-4">
                <span className="text-sm text-muted-foreground">Grand Total</span>
                <span className="text-xl font-bold">RM {total.toFixed(2)}</span>
              </div>

              {readOnly && (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  This PO is {status.toLowerCase()} and can no longer be edited.
                  {po.received_at && (
                    <span> Received on {format(new Date(po.received_at), 'PPpp')}.</span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" /> Print / PDF
                </Button>
                {status === 'Draft' && (
                  <>
                    <Button variant="outline" onClick={persistHeader}>
                      Save Draft
                    </Button>
                    <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancel PO
                    </Button>
                    <Button onClick={onMarkSent} disabled={setStatus.isPending}>
                      <Send className="h-4 w-4 mr-1" /> Mark as Sent
                    </Button>
                  </>
                )}
                {status === 'Sent' && (
                  <>
                    <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancel PO
                    </Button>
                    <Button onClick={() => setConfirmReceive(true)} disabled={receiveGoods.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Receive Goods
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReceive} onOpenChange={setConfirmReceive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive goods for {po?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will increase inventory stock by the ordered quantity for every line item and mark the PO as Received. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReceive}>Receive Goods</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this PO?</AlertDialogTitle>
            <AlertDialogDescription>
              The PO will be marked Cancelled and can no longer be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep PO</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel} className="bg-destructive text-destructive-foreground">
              Cancel PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {po && <POPrintTemplate po={po} supplier={supplier} />}
    </>
  );
}
