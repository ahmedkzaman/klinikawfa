import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePaymentMethods } from '@/hooks/clinic/usePaymentMethods';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import { useRecordPayment } from '@/hooks/clinic/usePayments';

type PaymentType = 'self_pay' | 'panel' | 'insurance';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntryId: string;
  consultationId: string | null;
  defaultAmount: number;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  queueEntryId,
  consultationId,
  defaultAmount,
}: Props) {
  const { data: methods = [] } = usePaymentMethods();
  const { data: providers = [] } = useInsuranceProviders();
  const recordPayment = useRecordPayment();

  const [paymentType, setPaymentType] = useState<PaymentType>('self_pay');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [amount, setAmount] = useState<string>(defaultAmount.toFixed(2));
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (open) {
      setAmount(Math.max(defaultAmount, 0).toFixed(2));
      setNotes('');
      setProviderId('');
      setPaymentMethodId('');
      setPaymentType('self_pay');
    }
  }, [open, defaultAmount]);

  const filteredMethods = useMemo(() => {
    if (paymentType === 'self_pay') {
      return methods.filter((m) =>
        ['cash', 'card', 'qr', 'bank_transfer', 'ewallet'].includes(
          (m.type ?? '').toLowerCase(),
        ),
      );
    }
    return methods.filter((m) => (m.type ?? '').toLowerCase() === 'panel');
  }, [methods, paymentType]);

  // Reset method choice when type changes
  useEffect(() => {
    setPaymentMethodId('');
  }, [paymentType]);

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }
    const method = methods.find((m) => m.id === paymentMethodId);
    if (!method) {
      toast.error('Please select a payment method');
      return;
    }
    if (paymentType !== 'self_pay' && !providerId) {
      toast.error('Please select an insurance / panel provider');
      return;
    }

    let finalNotes = notes.trim();
    if (paymentType !== 'self_pay') {
      const provider = providers.find((p) => p.id === providerId);
      if (provider) {
        finalNotes = finalNotes
          ? `Provider: ${provider.name}\n${finalNotes}`
          : `Provider: ${provider.name}`;
      }
    }

    try {
      await recordPayment.mutateAsync({
        queue_entry_id: queueEntryId,
        consultation_id: consultationId,
        payment_type: paymentType,
        payment_method: method.name,
        amount: numericAmount,
        notes: finalNotes || null,
      });
      toast.success('Payment recorded');
      onOpenChange(false);
    } catch {
      // toast already surfaced by hook onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Payment Type</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as PaymentType)}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="self_pay" id="pt-self" />
                Self-pay
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="panel" id="pt-panel" />
                Panel
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="insurance" id="pt-ins" />
                Insurance
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-method">Payment Method</Label>
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger id="pay-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {filteredMethods.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No methods configured
                  </div>
                ) : (
                  filteredMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {paymentType !== 'self_pay' && (
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No providers configured
                    </div>
                  ) : (
                    providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (RM)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reference number, remarks…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={recordPayment.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={recordPayment.isPending}>
            {recordPayment.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
