import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';
import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';
import { useCreateVendorInvoice } from '@/hooks/clinic/useVendorInvoices';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorInvoiceDialog({ open, onOpenChange }: Props) {
  const { suppliers } = useSuppliers();
  const { orders } = usePurchaseOrders();
  const create = useCreateVendorInvoice();

  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [poId, setPoId] = useState<string>('none');
  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');

  const filteredPOs = useMemo(
    () => orders.filter((p) => !supplierId || p.supplier_id === supplierId),
    [orders, supplierId],
  );

  const reset = () => {
    setInvoiceNo('');
    setSupplierId('');
    setPoId('none');
    setAmount('');
    setDueDate('');
  };

  const submit = async () => {
    if (!invoiceNo.trim()) return toast.error('Invoice number required');
    if (!supplierId) return toast.error('Supplier required');
    if (!amount || Number(amount) <= 0) return toast.error('Amount must be > 0');
    try {
      await create.mutateAsync({
        invoice_no: invoiceNo.trim(),
        supplier_id: supplierId,
        po_id: poId === 'none' ? null : poId,
        amount: Number(amount),
        due_date: dueDate || null,
      });
      toast.success('Invoice logged');
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log Vendor Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Invoice No.</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-2026-001" />
          </div>
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setPoId('none'); }}>
              <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.filter((s) => s.status === 'active').map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Linked PO (optional)</Label>
            <Select value={poId} onValueChange={setPoId} disabled={!supplierId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {filteredPOs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (RM)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
