import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useInsuranceProviders } from '@/hooks/clinic/useInsuranceProviders';
import { useRecordPayment } from '@/hooks/clinic/usePayments';
import { useUpdateConsultation } from '@/hooks/clinic/useConsultations';
import { useUpdateQueueEntry } from '@/hooks/clinic/useQueueEntries';

type PaymentType = 'self_pay' | 'panel';

import { PAYMENT_METHOD_OPTIONS } from '@/lib/clinic/paymentMethod';

const SELF_PAY_METHODS = PAYMENT_METHOD_OPTIONS;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntryId: string;
  consultationId: string | null;
  defaultAmount: number;
  /** Canonical method code (cash | qr_pay | card | transfer) to pre-select for self-pay. */
  defaultPaymentMethod?: string;
}


/**
 * Atomic checkout dialog.
 *
 * Flow on submit:
 *   1. Insert payment row (self-pay or panel).
 *   2. If consultationId is present, mark the consultation `completed`.
 *   3. Set the queue entry's `clinic_status` to `completed`.
 *   4. Toast, close, and navigate back to the Queue Board.
 *
 * If any step fails the dialog stays open with form state intact so the staff
 * can retry — this is intentional rather than a true DB transaction because
 * each operation is idempotent against re-running it once.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  queueEntryId,
  consultationId,
  defaultAmount,
  defaultPaymentMethod,
}: Props) {

  const navigate = useNavigate();
  const { data: providers = [] } = useInsuranceProviders({ activeOnly: true });
  const recordPayment = useRecordPayment();
  const updateConsultation = useUpdateConsultation();
  const updateQueueEntry = useUpdateQueueEntry();

  const [paymentType, setPaymentType] = useState<PaymentType>('self_pay');
  const [selfPayMethod, setSelfPayMethod] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [providerOpen, setProviderOpen] = useState(false);
  const [amount, setAmount] = useState<string>(defaultAmount.toFixed(2));
  const [notes, setNotes] = useState<string>('');

  // Reset every time the dialog opens.
  useEffect(() => {
    if (open) {
      setPaymentType('self_pay');
      setSelfPayMethod(defaultPaymentMethod ?? 'cash');
      setProviderId('');
      setProviderOpen(false);
      setAmount(Math.max(defaultAmount, 0).toFixed(2));
      setNotes('');
    }
  }, [open, defaultAmount, defaultPaymentMethod]);

  // When the user toggles between self-pay and panel, reset the default amount
  // (panel defaults to RM 0.00; self-pay defaults to outstanding). The selected
  // payment method is preserved across tabs so a panel copayment keeps the
  // physical method (cash / QR / card / transfer) the front desk picked.
  useEffect(() => {
    setProviderId('');
    setProviderOpen(false);
    setAmount(
      paymentType === 'panel'
        ? '0.00'
        : Math.max(defaultAmount, 0).toFixed(2),
    );
  }, [paymentType, defaultAmount]);


  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const isSubmitting =
    recordPayment.isPending ||
    updateConsultation.isPending ||
    updateQueueEntry.isPending;

  const numericAmountPreview = parseFloat(amount);
  const submitDisabled =
    isSubmitting ||
    (Number.isFinite(numericAmountPreview) && numericAmountPreview > 0 && !selfPayMethod) ||
    (paymentType === 'panel' && !providerId);

  const submittingLabel = recordPayment.isPending
    ? 'Recording payment…'
    : updateConsultation.isPending
      ? 'Completing visit…'
      : updateQueueEntry.isPending
        ? 'Checking out…'
        : 'Processing…';

  async function handleSubmit() {
    // ── Validation ───────────────────────────────────────────────────────────
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      toast.error('Amount must be a number ≥ 0');
      return;
    }
    if (paymentType === 'self_pay' && numericAmount <= 0) {
      toast.error('Self-pay amount must be greater than 0');
      return;
    }
    if (numericAmount > 0 && !selfPayMethod) {
      toast.error('Please select a payment method');
      return;
    }
    if (paymentType === 'panel' && !selectedProvider) {
      toast.error('Please select a panel');
      return;
    }

    // Panel string is recorded ONLY when the panel covers 100% of the bill.
    // Any out-of-pocket amount (even RM 0.50) records the physical method.
    const resolvedMethodLabel =
      paymentType === 'panel' && numericAmount === 0
        ? `Panel: ${selectedProvider!.name}`
        : selfPayMethod;

    let finalNotes = notes.trim();
    if (paymentType === 'panel' && selectedProvider) {
      finalNotes = finalNotes
        ? `Provider: ${selectedProvider.name}\n${finalNotes}`
        : `Provider: ${selectedProvider.name}`;
    }

    // ── Atomic 3-step flow — short-circuits on first failure ─────────────────
    try {
      // 1. Insert payment row
      await recordPayment.mutateAsync({
        queue_entry_id: queueEntryId,
        consultation_id: consultationId,
        payment_type: paymentType,
        payment_method: resolvedMethodLabel,
        amount: numericAmount,
        notes: finalNotes || null,
      });

      // 2. Mark consultation completed (only if one exists)
      if (consultationId) {
        await updateConsultation.mutateAsync({
          id: consultationId,
          status: 'completed',
        });
      }

      // 3. Check out queue entry
      await updateQueueEntry.mutateAsync({
        id: queueEntryId,
        clinic_status: 'completed',
      });

      toast.success('Payment recorded · Patient checked out');
      onOpenChange(false);
      navigate('/clinic/queue');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      toast.error(`Checkout failed: ${msg}`);
      // Intentionally do NOT close the dialog or navigate — leave state intact
      // so the staff can adjust and retry.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Block closing while a step is in flight.
        if (!isSubmitting) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment & Check Out</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Payment type */}
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
            </RadioGroup>
          </div>

          {/* Payment method — shown for both self-pay and panel (copayment) */}
          <div className="space-y-2">
            <Label htmlFor="pay-method">
              {paymentType === 'panel' ? 'Copayment Method' : 'Payment Method'}
            </Label>
            <Select value={selfPayMethod} onValueChange={setSelfPayMethod}>
              <SelectTrigger id="pay-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {SELF_PAY_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Panel provider picker — panel tab only */}
          {paymentType === 'panel' && (
            <div className="space-y-2">
              <Label>Panel</Label>
              <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={providerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedProvider ? (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{selectedProvider.name}</span>
                        {selectedProvider.panel_code && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({selectedProvider.panel_code})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search and select a panel…
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Search panel by name…" />
                    <CommandList>
                      <CommandEmpty>No panels found.</CommandEmpty>
                      <CommandGroup>
                        {providers.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.name} ${p.panel_code ?? ''}`}
                            onSelect={() => {
                              setProviderId(p.id);
                              setProviderOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                providerId === p.id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="flex-1 truncate">{p.name}</span>
                            {p.panel_code && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {p.panel_code}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount (RM)
              {paymentType === 'panel' && (
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  (default 0.00; edit for co-payment)
                </span>
              )}
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Notes */}
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
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {submittingLabel}
              </>
            ) : (
              'Record Payment & Check Out'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
