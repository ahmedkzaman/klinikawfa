import { useEffect, useMemo, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Printer, Save, Send, CheckCircle2, Loader2, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useCorporateClients } from '@/hooks/clinic/useCorporateClients';
import {
  useClientInvoiceDetail,
  useCreateClientInvoice,
  useUpdateClientInvoiceHeader,
  type ClientInvoiceStatus,
} from '@/hooks/clinic/useClientInvoices';
import { useSaveClientInvoiceItems, type InvoiceItemDraft } from '@/hooks/clinic/useClientInvoiceItems';
import { ClientInvoicePrintTemplate } from './ClientInvoicePrintTemplate';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId?: string | null;
}

interface LineRow extends InvoiceItemDraft {
  _key: string;
}

const newRow = (): LineRow => ({
  _key: crypto.randomUUID(),
  description: '',
  quantity: 1,
  unit_price: 0,
});

const statusBadge = (s: ClientInvoiceStatus) => {
  const map: Record<ClientInvoiceStatus, string> = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200',
    Issued: 'bg-blue-100 text-blue-700 border-blue-200',
    Paid: 'bg-green-100 text-green-700 border-green-200',
    Cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  };
  return map[s];
};

export function ClientInvoiceSheet({ open, onOpenChange, invoiceId }: Props) {
  const isEdit = !!invoiceId;
  const { data: clients = [] } = useCorporateClients();
  const { data: detail, isFetching } = useClientInvoiceDetail(invoiceId ?? null);

  const create = useCreateClientInvoice();
  const updateHeader = useUpdateClientInvoiceHeader();
  const saveItems = useSaveClientInvoiceItems();

  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ClientInvoiceStatus>('Draft');
  const [paymentRef, setPaymentRef] = useState('');
  const [rows, setRows] = useState<LineRow[]>([newRow()]);

  const [paidPromptOpen, setPaidPromptOpen] = useState(false);
  const [paidRef, setPaidRef] = useState('');
  const [cancelPromptOpen, setCancelPromptOpen] = useState(false);

  const handleCancelInvoice = async () => {
    if (!invoiceId) return;
    try {
      await updateHeader.mutateAsync({ id: invoiceId, patch: { status: 'Cancelled' } });
      setStatus('Cancelled');
      setCancelPromptOpen(false);
      toast.success('Invoice cancelled');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Hydrate from detail
  useEffect(() => {
    if (!open) return;
    if (isEdit && detail) {
      setClientId(detail.client_id);
      setIssueDate(detail.issue_date);
      setDueDate(detail.due_date ?? '');
      setNotes(detail.notes ?? '');
      setStatus(detail.status);
      setPaymentRef(detail.payment_ref ?? '');
      setRows(
        detail.items.length
          ? detail.items.map((it) => ({
              _key: it.id,
              description: it.description,
              quantity: Number(it.quantity),
              unit_price: Number(it.unit_price),
            }))
          : [newRow()],
      );
    } else if (!isEdit) {
      setClientId('');
      setIssueDate(today);
      setDueDate('');
      setNotes('');
      setStatus('Draft');
      setPaymentRef('');
      setRows([newRow()]);
    }
  }, [open, isEdit, detail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const grandTotal = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0),
        0,
      ),
    [rows],
  );

  const validRowCount = rows.filter((r) => r.description.trim().length > 0).length;
  const pending = create.isPending || updateHeader.isPending || saveItems.isPending;
  const activeClients = clients.filter((c) => c.status === 'active' || c.id === clientId);

  const setRow = (key: string, patch: Partial<LineRow>) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r._key !== key)));

  // Core save: persists header + items atomically. If creating, returns the new id.
  const persist = async (overrideStatus?: ClientInvoiceStatus, overridePaymentRef?: string) => {
    if (!clientId) {
      toast.error('Select a client');
      return null;
    }
    if (validRowCount === 0) {
      toast.error('Add at least one line item');
      return null;
    }
    const items: InvoiceItemDraft[] = rows.map((r) => ({
      description: r.description,
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
    }));
    try {
      let id = invoiceId ?? null;
      if (!id) {
        const created = await create.mutateAsync({
          client_id: clientId,
          issue_date: issueDate,
          due_date: dueDate || null,
          notes: notes || null,
        });
        id = created.id;
      } else {
        await updateHeader.mutateAsync({
          id,
          patch: {
            client_id: clientId,
            issue_date: issueDate,
            due_date: dueDate || null,
            notes: notes || null,
          },
        });
      }
      // Atomic items save (single-tx RPC)
      await saveItems.mutateAsync({ invoiceId: id, items });

      // Apply status / payment_ref change after items are safely persisted
      if (overrideStatus && (overrideStatus !== status || overridePaymentRef !== undefined)) {
        await updateHeader.mutateAsync({
          id,
          patch: {
            status: overrideStatus,
            ...(overridePaymentRef !== undefined ? { payment_ref: overridePaymentRef } : {}),
          },
        });
        setStatus(overrideStatus);
        if (overridePaymentRef !== undefined) setPaymentRef(overridePaymentRef);
      }
      return id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const handleSaveDraft = async () => {
    const id = await persist();
    if (id) toast.success('Draft saved');
  };

  const handleMarkIssued = async () => {
    const id = await persist('Issued');
    if (id) toast.success('Invoice issued');
  };

  const handleMarkPaid = () => {
    if (!clientId || validRowCount === 0) {
      toast.error('Complete the invoice first');
      return;
    }
    setPaidRef(paymentRef ?? '');
    setPaidPromptOpen(true);
  };

  const confirmPaid = async () => {
    if (!paidRef.trim()) {
      toast.error('Payment reference required');
      return;
    }
    const id = await persist('Paid', paidRef.trim());
    if (id) {
      setPaidPromptOpen(false);
      toast.success('Marked as paid');
    }
  };

  const handlePrint = () => {
    if (!isEdit) {
      toast.error('Save the invoice first');
      return;
    }
    window.print();
  };

  const handleOpenChange = (o: boolean) => {
    if (pending) return; // block close mid-save
    onOpenChange(o);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-3xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              {isEdit ? `Invoice ${detail?.invoice_no ?? ''}` : 'Create Invoice'}
              {isEdit && (
                <Badge variant="outline" className={statusBadge(status)}>{status}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {isEdit && isFetching && !detail ? (
            <div className="py-12 flex justify-center text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Header fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Client *</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Select corporate client" /></SelectTrigger>
                    <SelectContent>
                      {activeClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Issue Date</Label>
                  <Input type="date" value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal notes or payment terms…" />
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Line Items</Label>
                  <Button type="button" size="sm" variant="outline"
                    onClick={() => setRows((rs) => [...rs, newRow()])}>
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium text-right w-24">Qty</th>
                        <th className="px-3 py-2 font-medium text-right w-32">Unit Price (RM)</th>
                        <th className="px-3 py-2 font-medium text-right w-28">Total (RM)</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const lineTotal = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
                        return (
                          <tr key={r._key} className="border-t align-top">
                            <td className="px-2 py-2">
                              <Input
                                value={r.description}
                                onChange={(e) => setRow(r._key, { description: e.target.value })}
                                placeholder="e.g. Basic Life Support Training - 10 pax"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number" inputMode="decimal" step="0.01" min="0"
                                value={r.quantity}
                                onChange={(e) => setRow(r._key, { quantity: Number(e.target.value) })}
                                className="text-right"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                type="number" inputMode="decimal" step="0.01" min="0"
                                value={r.unit_price}
                                onChange={(e) => setRow(r._key, { unit_price: Number(e.target.value) })}
                                className="text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{lineTotal.toFixed(2)}</td>
                            <td className="px-2 py-2">
                              <Button type="button" variant="ghost" size="icon"
                                onClick={() => removeRow(r._key)}
                                aria-label="Remove line">
                                <Trash2 className="h-4 w-4 text-slate-500" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right font-semibold">
                          Grand Total (RM)
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-base">
                          {grandTotal.toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {status === 'Paid' && paymentRef && (
                <div className="text-sm text-slate-600">
                  <span className="font-medium">Payment Ref:</span> {paymentRef}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={handlePrint} disabled={!isEdit || pending}>
                  <Printer className="h-4 w-4 mr-1" /> Download PDF / Print
                </Button>
                {isEdit && status === 'Cancelled' ? (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!invoiceId) return;
                      try {
                        await updateHeader.mutateAsync({ id: invoiceId, patch: { status: 'Draft' } });
                        setStatus('Draft');
                        toast.success('Invoice reopened as Draft');
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                    disabled={pending}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Reopen as Draft
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={handleSaveDraft} disabled={pending || status === 'Cancelled'}>
                      <Save className="h-4 w-4 mr-1" /> Save Draft
                    </Button>
                    <Button variant="outline" onClick={handleMarkIssued} disabled={pending || status === 'Paid' || status === 'Cancelled'}>
                      <Send className="h-4 w-4 mr-1" /> Mark as Issued
                    </Button>
                    <Button onClick={handleMarkPaid} disabled={pending || status === 'Paid' || status === 'Cancelled'}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Paid
                    </Button>
                    {isEdit && status !== 'Paid' && (
                      <Button
                        variant="outline"
                        onClick={() => setCancelPromptOpen(true)}
                        disabled={pending}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      >
                        <Ban className="h-4 w-4 mr-1" /> Cancel Invoice
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Hidden print template — only renders when invoice is loaded */}
          {isEdit && detail && (
            <ClientInvoicePrintTemplate invoice={detail} />
          )}
        </SheetContent>
      </Sheet>

      {/* Mark as Paid prompt */}
      <Dialog open={paidPromptOpen} onOpenChange={(o) => { if (!pending) setPaidPromptOpen(o); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Mark Invoice as Paid</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Payment Reference</Label>
            <Input
              autoFocus
              value={paidRef}
              onChange={(e) => setPaidRef(e.target.value)}
              placeholder="e.g. MBB-2026-7745 or Cheque #221"
            />
            <p className="text-xs text-slate-500">
              Bank transaction ID, cheque number, or other reference for audit trail.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidPromptOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirmPaid} disabled={pending}>
              {pending ? 'Saving…' : 'Confirm Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Invoice confirm */}
      <Dialog open={cancelPromptOpen} onOpenChange={(o) => { if (!pending) setCancelPromptOpen(o); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cancel this invoice?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-600 space-y-2">
            <p>
              The invoice will be marked as <span className="font-semibold">Cancelled</span> and excluded from outstanding receivables. The invoice number is preserved for audit.
            </p>
            <p className="text-xs text-slate-500">
              You can reopen it as a Draft later if cancelled by mistake.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelPromptOpen(false)} disabled={pending}>
              Keep Invoice
            </Button>
            <Button
              onClick={handleCancelInvoice}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {pending ? 'Cancelling…' : 'Yes, Cancel Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
