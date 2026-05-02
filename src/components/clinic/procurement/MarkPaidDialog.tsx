import { useState, useEffect } from 'react';
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
import { useMarkInvoicePaid } from '@/hooks/clinic/useVendorInvoices';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  invoiceId: string | null;
  invoiceNo?: string | null;
  onOpenChange: (open: boolean) => void;
}

export function MarkPaidDialog({ open, invoiceId, invoiceNo, onOpenChange }: Props) {
  const [ref, setRef] = useState('');
  const mark = useMarkInvoicePaid();

  useEffect(() => { if (!open) setRef(''); }, [open]);

  const submit = async () => {
    if (!invoiceId) return;
    if (!ref.trim()) return toast.error('Payment reference required');
    try {
      await mark.mutateAsync({ id: invoiceId, payment_ref: ref.trim() });
      toast.success('Invoice marked as paid');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Mark as Paid {invoiceNo ? `· ${invoiceNo}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Payment Reference</Label>
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="e.g. TXN-12345 / Cheque #998"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mark.isPending}>
            {mark.isPending ? 'Saving…' : 'Mark Paid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
