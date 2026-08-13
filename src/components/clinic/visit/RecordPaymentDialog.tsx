import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  useRecordSplitPayments,
  useRecordSplitPaymentsAndCompleteVisit,
} from '@/hooks/clinic/usePayments';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/clinic/paymentMethod';
import {
  PHYSICAL_PAYMENT_METHODS,
  fromSen,
  remainingAllocationAmount,
  toSen,
  validatePaymentAllocations,
  type PatientPaymentAllocation,
  type PhysicalPaymentMethod,
} from '@/lib/clinic/paymentAllocations';

type PaymentType = 'self_pay' | 'panel';

interface EditableAllocation {
  id: string;
  method: PhysicalPaymentMethod | '';
  amount: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queueEntryId: string;
  consultationId: string | null;
  defaultAmount: number;
  /** Active dispensary visits complete atomically; completed records stay payment-only. */
  completeVisitOnPayment?: boolean;
  /** Canonical method code (cash | qr_pay | card | transfer) to pre-select for self-pay. */
  defaultPaymentMethod?: string;
  /** Stored visit payer context; completed collections never reselect providers. */
  storedPanelProvider?: { id: string; name: string } | null;
}

function canonicalDefaultMethod(method: string | undefined): PhysicalPaymentMethod | '' {
  const candidate = method ?? 'cash';
  return PHYSICAL_PAYMENT_METHODS.includes(candidate as PhysicalPaymentMethod)
    ? candidate as PhysicalPaymentMethod
    : '';
}

function normalizeCurrencyAmount(amount: number) {
  return fromSen(toSen(amount));
}

function numericAllocation(row: EditableAllocation): PatientPaymentAllocation {
  const amount = Number.parseFloat(row.amount);
  return {
    method: row.method,
    amount: Number.isFinite(amount) ? normalizeCurrencyAmount(amount) : 0,
  };
}

function createInitialAllocation(
  type: PaymentType,
  defaultPaymentMethod: string | undefined,
  expectedBalance: number,
): EditableAllocation {
  return {
    id: crypto.randomUUID(),
    method: canonicalDefaultMethod(defaultPaymentMethod),
    amount: type === 'panel' ? '0.00' : expectedBalance.toFixed(2),
  };
}

/** Payment dialog supporting atomic multi-method patient payment batches. */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  queueEntryId,
  consultationId,
  defaultAmount,
  completeVisitOnPayment = false,
  defaultPaymentMethod,
  storedPanelProvider = null,
}: Props) {
  const navigate = useNavigate();
  const { data: providers = [] } = useInsuranceProviders({ activeOnly: true });
  const recordSplitPayments = useRecordSplitPayments();
  const recordSplitPaymentsAndCompleteVisit = useRecordSplitPaymentsAndCompleteVisit();

  const [paymentType, setPaymentType] = useState<PaymentType>('self_pay');
  const [allocations, setAllocations] = useState<EditableAllocation[]>([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [providerId, setProviderId] = useState('');
  const [providerOpen, setProviderOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [expectedBalance, setExpectedBalance] = useState(
    () => normalizeCurrencyAmount(Math.max(defaultAmount, 0)),
  );
  const [panelPatientAmount, setPanelPatientAmount] = useState('0.00');
  const [openingPaymentMethod, setOpeningPaymentMethod] = useState(defaultPaymentMethod);
  const wasOpen = useRef(false);

  useEffect(() => {
    const isOpening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!isOpening) return;

    const openingBalance = normalizeCurrencyAmount(Math.max(defaultAmount, 0));
    setExpectedBalance(openingBalance);
    setOpeningPaymentMethod(defaultPaymentMethod);
    const openingType: PaymentType = !completeVisitOnPayment && storedPanelProvider
      ? 'panel'
      : 'self_pay';
    setPaymentType(openingType);
    setAllocations([createInitialAllocation(
      openingType,
      defaultPaymentMethod,
      openingBalance,
    )]);
    setIdempotencyKey(crypto.randomUUID());
    setProviderId('');
    setProviderOpen(false);
    setNotes('');
    setPanelPatientAmount(openingType === 'panel' ? openingBalance.toFixed(2) : '0.00');
  }, [open, defaultAmount, defaultPaymentMethod, completeVisitOnPayment, storedPanelProvider]);

  const selectedProvider = useMemo(() => (
    !completeVisitOnPayment
      ? storedPanelProvider
      : providers.find((provider) => provider.id === providerId) ?? null
  ), [completeVisitOnPayment, providers, providerId, storedPanelProvider]);

  const numericAllocations = useMemo(
    () => allocations.map(numericAllocation),
    [allocations],
  );

  const zeroPaymentCheckout = allocations.length === 1
    && allocations[0].amount.trim() !== ''
    && Number(allocations[0].amount) === 0
    && (paymentType === 'panel' || expectedBalance === 0);

  const submittedAllocations = zeroPaymentCheckout ? [] : numericAllocations;
  const allocationTarget = paymentType === 'panel' && !completeVisitOnPayment
    ? normalizeCurrencyAmount(Number(panelPatientAmount) || 0)
    : expectedBalance;
  const validation = validatePaymentAllocations({
    allocations: submittedAllocations,
    expectedAmount: zeroPaymentCheckout ? 0 : allocationTarget,
    requireExact: paymentType === 'self_pay' && completeVisitOnPayment,
  });
  const remaining = remainingAllocationAmount(allocationTarget, numericAllocations);

  const activeMutation = completeVisitOnPayment
    ? recordSplitPaymentsAndCompleteVisit
    : recordSplitPayments;
  const isSubmitting = activeMutation.isPending;
  const submitDisabled = isSubmitting
    || !validation.valid
    || (!completeVisitOnPayment && paymentType === 'self_pay' && expectedBalance === 0)
    || (!completeVisitOnPayment && allocationTarget === 0)
    || (paymentType === 'panel' && !selectedProvider);
  const addDisabled = allocations.length >= PHYSICAL_PAYMENT_METHODS.length || remaining === 0;

  function resetForPaymentType(type: PaymentType) {
    setPaymentType(type);
    setAllocations([createInitialAllocation(type, openingPaymentMethod, expectedBalance)]);
    setIdempotencyKey(crypto.randomUUID());
    setProviderId('');
    setProviderOpen(false);
    setPanelPatientAmount(type === 'panel' ? '0.00' : expectedBalance.toFixed(2));
  }

  function updateAllocation(id: string, patch: Partial<EditableAllocation>) {
    setAllocations((current) => current.map((row) => (
      row.id === id ? { ...row, ...patch } : row
    )));
  }

  function addAllocation() {
    if (addDisabled) return;
    setAllocations((current) => [
      ...current,
      { id: crypto.randomUUID(), method: '', amount: remaining.toFixed(2) },
    ]);
  }

  function removeAllocation(id: string) {
    setAllocations((current) => current.filter((row) => row.id !== id));
  }

  async function handleSubmit() {
    if (!validation.valid) {
      toast.error(validation.errors[0] ?? 'Check the payment allocations.');
      return;
    }
    if (paymentType === 'panel' && !selectedProvider) {
      toast.error('Please select a panel');
      return;
    }

    const payments = submittedAllocations.map((row) => ({
      method: row.method,
      amount: row.amount,
    }));
    const expectedPatientAmount = paymentType === 'self_pay' && completeVisitOnPayment
      ? expectedBalance
      : validation.total;

    try {
      await activeMutation.mutateAsync({
        queue_entry_id: queueEntryId,
        consultation_id: consultationId,
        payment_type: paymentType,
        expected_patient_amount: expectedPatientAmount,
        payments,
        provider_id: selectedProvider?.id ?? null,
        notes: notes.trim() || null,
        idempotency_key: idempotencyKey,
      });

      setIdempotencyKey(crypto.randomUUID());
      toast.success(completeVisitOnPayment ? 'Payment recorded · Patient checked out' : 'Payment recorded');
      onOpenChange(false);
      if (completeVisitOnPayment) navigate('/clinic/queue');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout failed';
      const stale = message.match(/STALE_PATIENT_OUTSTANDING: expected\s+([0-9.]+)/i);
      if (stale) {
        const currentBalance = normalizeCurrencyAmount(Number(stale[1]));
        setExpectedBalance(currentBalance);
        if (paymentType === 'panel' && !completeVisitOnPayment) {
          setPanelPatientAmount(currentBalance.toFixed(2));
        }
        toast.error(`Balance changed. Current patient outstanding is RM${currentBalance.toFixed(2)}. Adjust the allocations and retry.`);
      } else {
        toast.error(`${completeVisitOnPayment ? 'Checkout' : 'Payment'} failed: ${message}`);
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{completeVisitOnPayment ? 'Record Payment & Check Out' : 'Record Payment'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {(!storedPanelProvider || completeVisitOnPayment) && <div className="space-y-2">
            <Label>Payment Type</Label>
            <RadioGroup
              value={paymentType}
              onValueChange={(value) => resetForPaymentType(value as PaymentType)}
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
          </div>}

          {paymentType === 'panel' && !completeVisitOnPayment && storedPanelProvider && (
            <div className="space-y-2">
              <Label>Panel</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {storedPanelProvider.name}
              </div>
              <p className="text-xs text-muted-foreground">
                Provider is fixed from the completed visit.
              </p>
            </div>
          )}

          {paymentType === 'panel' && !completeVisitOnPayment && !storedPanelProvider && (
            <p role="alert" className="text-xs text-destructive">
              This completed visit has no stored panel provider. Refresh the visit before collecting payment.
            </p>
          )}

          {paymentType === 'panel' && completeVisitOnPayment && (
            <div className="space-y-2">
              <Label htmlFor="panel-provider">Panel</Label>
              <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="panel-provider"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={providerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedProvider ? (
                      <span className="truncate">{selectedProvider.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Search and select a panel…</span>
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
                        {providers.map((provider) => (
                          <CommandItem
                            key={provider.id}
                            value={provider.name}
                            onSelect={() => {
                              setProviderId(provider.id);
                              setProviderOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                providerId === provider.id ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="flex-1 truncate">{provider.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {paymentType === 'panel' && !completeVisitOnPayment && (
            <div className="space-y-2">
              <Label htmlFor="panel-patient-amount">Patient collection amount (RM)</Label>
              <Input
                id="panel-patient-amount"
                type="number"
                min="0"
                step="0.01"
                value={panelPatientAmount}
                onChange={(event) => setPanelPatientAmount(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-3">
            <Label>{paymentType === 'panel' ? 'Co-payment methods' : 'Payment methods'}</Label>
            {allocations.map((row, index) => {
              const methodId = `payment-method-${row.id}`;
              const amountId = `payment-amount-${row.id}`;
              const suffix = index === 0 ? '' : ` ${index + 1}`;
              return (
                <div key={row.id} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                  <div className="space-y-2">
                    <Label htmlFor={methodId}>Payment method{suffix}</Label>
                    <Select
                      value={row.method}
                      onValueChange={(method) => updateAllocation(row.id, {
                        method: method as PhysicalPaymentMethod,
                      })}
                    >
                      <SelectTrigger id={methodId}>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHOD_OPTIONS.map((method) => (
                          <SelectItem
                            key={method.value}
                            value={method.value}
                            disabled={allocations.some((other) => (
                              other.id !== row.id && other.method === method.value
                            ))}
                          >
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={amountId}>Amount{suffix} (RM)</Label>
                    <Input
                      id={amountId}
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.amount}
                      onChange={(event) => updateAllocation(row.id, { amount: event.target.value })}
                    />
                  </div>
                  {allocations.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAllocation(row.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAllocation}
                disabled={addDisabled}
              >
                Add payment method
              </Button>
              <p className="text-sm text-muted-foreground text-right">
                Allocated RM{validation.total.toFixed(2)} / Remaining RM{remaining.toFixed(2)}
              </p>
            </div>

            {validation.errors.length > 0 && !zeroPaymentCheckout && (
              <div className="space-y-1 text-sm text-destructive" role="alert">
                {validation.errors.map((error) => <p key={error}>{error}</p>)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
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
                Processing…
              </>
            ) : (
              completeVisitOnPayment ? 'Record Payment & Check Out' : 'Record Payment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
