import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Send, Printer, Truck } from 'lucide-react';
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
import { usePurchaseOrder, usePurchaseOrders, type POChannel, type POStatus } from '@/hooks/clinic/usePurchaseOrders';
import { useProcurementAccess } from '@/hooks/clinic/useProcurementDashboard';
import { POLineItemsTable } from './POLineItemsTable';
import { POPrintTemplate } from './POPrintTemplate';
import { ProcurementAttachments } from './ProcurementAttachments';
import { toast } from 'sonner';

interface Props {
  poId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Management-approval permission from the database (useProcurementAccess). */
  canApprove?: boolean;
}

const statusVariant: Record<POStatus, { className: string; label: string }> = {
  Draft:             { className: 'bg-muted text-muted-foreground', label: 'Draft' },
  'Awaiting approval': { className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', label: 'Awaiting approval' },
  Ordered:           { className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Ordered' },
  Received:          { className: 'bg-green-500/15 text-green-700 dark:text-green-400', label: 'Received' },
  Cancelled:         { className: 'bg-destructive/15 text-destructive', label: 'Cancelled' },
};

const CHANNELS: Array<{ value: POChannel; label: string }> = [
  { value: 'internal', label: 'Internal' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'supplier_website', label: 'Supplier website' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

export function POSheet({ poId, open, onOpenChange, canApprove = false }: Props) {
  const { data: po, isLoading } = usePurchaseOrder(open ? poId : null);
  const { suppliers } = useSuppliers();
  const { updateHeader, transitionOrder, receiveGoods } = usePurchaseOrders();
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [followUpRequested, setFollowUpRequested] = useState(false);

  const [supplierId, setSupplierId] = useState<string>('');
  const [orderDate, setOrderDate] = useState<string>('');
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [orderChannel, setOrderChannel] = useState<POChannel>('internal');
  const [supplierReference, setSupplierReference] = useState<string>('');

  useEffect(() => {
    if (po) {
      setSupplierId(po.supplier_id);
      setOrderDate(po.order_date ?? '');
      setExpectedDate(po.expected_date ?? '');
      setNotes(po.notes ?? '');
      setOrderChannel(po.order_channel ?? 'internal');
      setSupplierReference(po.supplier_reference ?? '');
    }
  }, [po]);

  const status = (po?.status ?? 'Draft') as POStatus;
  const readOnly = status === 'Received' || status === 'Cancelled';
  const external = orderChannel !== 'internal';
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
        order_channel: orderChannel,
        supplier_reference: supplierReference || null,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const requestSubmit = () => {
    if (!po) return;
    if (!po.items.length) {
      toast.error('Add at least one line item before submitting.');
      return;
    }
    if (!supplierId) {
      toast.error('Select a supplier first.');
      return;
    }
    setConfirmSubmit(true);
  };

  /**
   * Interpret the RPC result: the database decides the resulting status.
   * 'Awaiting approval' means the order exceeded a budget/limit and needs
   * management; 'Ordered' means it went straight through.
   */
  const onSubmit = async () => {
    if (!po) return;
    await persistHeader();
    try {
      const result = await transitionOrder.mutateAsync({ id: po.id, status: 'Ordered' });
      if (result === 'Awaiting approval') {
        toast.success('Order sent for management approval');
      } else {
        toast.success('Order marked as ordered');
      }
      setConfirmSubmit(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onApprove = async () => {
    if (!po) return;
    try {
      await transitionOrder.mutateAsync({ id: po.id, status: 'Ordered' });
      toast.success('Order marked as ordered');
      setConfirmApprove(false);
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
      await transitionOrder.mutateAsync({ id: po.id, status: 'Cancelled' });
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
                  Draft → Awaiting approval → Ordered → Received. Goods received here update inventory stock.
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
                  <Label htmlFor="po-supplier">Supplier</Label>
                  <Select
                    value={supplierId}
                    onValueChange={(v) => setSupplierId(v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger id="po-supplier">
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="po-order-date">Order Date</Label>
                    <Input
                      id="po-order-date"
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      onBlur={persistHeader}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="po-expected-date">Expected Date</Label>
                    <Input
                      id="po-expected-date"
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      onBlur={persistHeader}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="po-channel">Order channel</Label>
                    <Select
                      value={orderChannel}
                      onValueChange={(v) => setOrderChannel(v as POChannel)}
                      disabled={readOnly}
                    >
                      <SelectTrigger id="po-channel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {external && (
                    <div className="grid gap-2">
                      <Label htmlFor="po-supplier-reference">Supplier reference</Label>
                      <Input
                        id="po-supplier-reference"
                        placeholder="Supplier's PO / invoice number"
                        value={supplierReference}
                        onChange={(e) => setSupplierReference(e.target.value)}
                        onBlur={persistHeader}
                        disabled={readOnly}
                      />
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="po-notes">Notes</Label>
                  <Textarea
                    id="po-notes"
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

              {/* External-order evidence */}
              {external && <ProcurementAttachments poId={po.id} />}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" /> Print / PDF
                </Button>
                {status === 'Draft' && (
                  <>
                    <Button variant="outline" onClick={persistHeader} disabled={updateHeader.isPending}>
                      {updateHeader.isPending ? 'Saving…' : 'Save Draft'}
                    </Button>
                    <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancel PO
                    </Button>
                    <Button onClick={requestSubmit} disabled={transitionOrder.isPending || updateHeader.isPending}>
                      <Send className="h-4 w-4 mr-1" /> Submit order
                    </Button>
                  </>
                )}
                {status === 'Awaiting approval' && canApprove && (
                  <>
                    <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancel PO
                    </Button>
                    <Button onClick={() => setConfirmApprove(true)} disabled={transitionOrder.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve and order
                    </Button>
                  </>
                )}
                {status === 'Ordered' && (
                  <>
                    <Button
                      variant="outline"
                      disabled={followUpRequested}
                      onClick={() => {
                        setFollowUpRequested(true);
                        toast.info(`Follow-up noted for ${po.po_number}`);
                      }}
                    >
                      Follow up
                    </Button>
                    <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
                      <XCircle className="h-4 w-4 mr-1" /> Cancel PO
                    </Button>
                    <Button onClick={() => setConfirmReceive(true)} disabled={receiveGoods.isPending}>
                      <Truck className="h-4 w-4 mr-1" /> Receive goods
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
            <AlertDialogAction onClick={onReceive}>Receive goods</AlertDialogAction>
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

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit {po?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Orders within budget go straight to Ordered; larger orders are sent for management approval first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as Draft</AlertDialogCancel>
            <AlertDialogAction onClick={onSubmit} disabled={transitionOrder.isPending}>
              {transitionOrder.isPending ? 'Submitting…' : 'Submit order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {po?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The order will be marked as Ordered with you recorded as the approver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={onApprove} disabled={transitionOrder.isPending}>
              {transitionOrder.isPending ? 'Approving…' : 'Approve and order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {po && <POPrintTemplate po={po} supplier={supplier} />}
    </>
  );
}
