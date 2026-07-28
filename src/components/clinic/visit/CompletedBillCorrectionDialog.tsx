import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useClinicChargeTypes } from '@/hooks/clinic/useClinicChargeTypes';
import {
  useCompletedBillCorrectionContext,
  useCorrectCompletedBill,
} from '@/hooks/clinic/useCompletedBillCorrection';
import {
  calculateCompletedBillTotals,
  toCompletedBillCorrectionPayload,
  validateCompletedBillCorrection,
  type CompletedBillCorrectionDraft,
  type CompletedBillCorrectionItem,
} from '@/lib/clinic/completedBillCorrection';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/clinic/paymentMethod';

export interface CompletedBillCorrectionDialogProps {
  queueEntryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrected?: () => void | Promise<void>;
}

const money = (value: number) => `RM ${value.toFixed(2)}`;

type DraftItem = CompletedBillCorrectionItem & { clientKey?: string };

function numberValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDraft(context: NonNullable<ReturnType<typeof useCompletedBillCorrectionContext>['data']>)
  : CompletedBillCorrectionDraft {
  return {
    items: context.items.map((item, index) => ({
      ...item,
      ...(item.id === null ? { clientKey: `loaded-charge-${index}` } : {}),
    })),
    payments: context.payments.map((payment) => ({ ...payment })),
    discountRm: context.originalTotals.discountRm,
    taxPct: context.originalTotals.taxPct,
    reason: '',
  };
}

export function CompletedBillCorrectionDialog({
  queueEntryId,
  open,
  onOpenChange,
  onCorrected,
}: CompletedBillCorrectionDialogProps) {
  const contextQuery = useCompletedBillCorrectionContext(queueEntryId, open);
  const correctBill = useCorrectCompletedBill();
  const { data: chargeTypes = [] } = useClinicChargeTypes({ activeOnly: true });
  const [draft, setDraft] = useState<CompletedBillCorrectionDraft | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const newChargeCounter = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeQueueEntryId = useRef(queueEntryId);

  const context = contextQuery.data;
  const contextKey = context ? `${queueEntryId}:${context.fingerprint}` : null;

  useEffect(() => {
    if (!open) {
      activeQueueEntryId.current = queueEntryId;
      setDraft(null);
      setLoadedKey(null);
      setSubmissionError(null);
      return;
    }
    if (activeQueueEntryId.current !== queueEntryId) {
      activeQueueEntryId.current = queueEntryId;
      setDraft(null);
      setLoadedKey(null);
      setSubmissionError(null);
    }
    if (context?.queueEntryId === queueEntryId && contextKey !== loadedKey) {
      const nextDraft = toDraft(context);
      setDraft(nextDraft);
      setLoadedKey(contextKey);
      setSubmissionError(null);
    }
  }, [context, contextKey, loadedKey, open, queueEntryId]);

  const totals = useMemo(() => draft && calculateCompletedBillTotals(draft), [draft]);
  const originalTotals = context?.originalTotals;
  const errors = useMemo(() => draft ? validateCompletedBillCorrection(draft) : {}, [draft]);
  const isSubmitting = submitting || correctBill.isPending;
  const staleBill = submissionError === 'This bill changed after you opened it. Reload and try again.';

  function updateItem(index: number, update: Partial<CompletedBillCorrectionItem>) {
    setDraft((current) => {
      if (!current) return current;
      const items = current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...update } : item
      ));
      return { ...current, items };
    });
  }

  function removeNewCharge(index: number) {
    setDraft((current) => current ? {
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    } : current);
  }

  function updatePayment(index: number, update: { amount?: number; paymentMethod?: string }) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        payments: current.payments.map((payment, paymentIndex) => (
          paymentIndex === index ? { ...payment, ...update } : payment
        )),
      };
    });
  }

  function addOtherCharge(chargeTypeId: string) {
    const chargeType = chargeTypes.find((charge) => charge.id === chargeTypeId);
    if (!chargeType) return;
    setDraft((current) => current ? {
      ...current,
      items: [...current.items, {
        id: null,
        clientKey: `new-charge-${chargeType.id}-${newChargeCounter.current++}`,
        itemName: chargeType.name,
        quantity: 1,
        price: Number(chargeType.default_amount) || 0,
        itemId: null,
        serviceId: null,
        packageId: null,
        dispensedQty: null,
        adjustmentKind: 'other_charge',
        chargeTypeId: chargeType.id,
        remove: false,
      }],
    } : current);
  }

  async function submit() {
    if (!draft || !context || Object.keys(errors).length > 0 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await correctBill.mutateAsync(toCompletedBillCorrectionPayload(context, draft));
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Correction failed.');
      return;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    toast.success('Completed bill corrected');
    onOpenChange(false);
    void Promise.resolve(onCorrected?.()).catch(() => undefined);
  }

  function reloadBill() {
    setSubmissionError(null);
    setDraft(null);
    setLoadedKey(null);
    void contextQuery.refetch();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !isSubmitting) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>Correct completed bill</DialogTitle>
          <DialogDescription>This changes a completed financial record.</DialogDescription>
        </DialogHeader>

        {contextQuery.isLoading && <div role="status" className="py-8 text-center">Loading bill…</div>}
        {contextQuery.isError && (
          <Alert variant="destructive">{contextQuery.error?.message ?? 'Unable to load this bill.'}</Alert>
        )}

        {draft && totals && originalTotals && context && (
          <div className="space-y-5">
            <Alert>This correction is recorded for audit purposes. Clinical and catalogue details cannot be changed here.</Alert>
            {submissionError && <Alert variant="destructive">{submissionError}</Alert>}
            {staleBill && (
              <Button type="button" variant="outline" onClick={reloadBill} disabled={isSubmitting}>
                Reload bill
              </Button>
            )}

            <section className="space-y-3" aria-labelledby="bill-items-heading">
              <h3 id="bill-items-heading" className="font-medium">Bill items</h3>
              {draft.items.map((item, index) => {
                const isOtherCharge = item.adjustmentKind === 'other_charge';
                const isNewCharge = item.id === null && isOtherCharge;
                const protectedMedicine = item.dispensedQty !== null && item.dispensedQty > 0;
                const key = item.id ?? (item as DraftItem).clientKey;
                return (
                  <div key={key} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.itemName}</span>
                      {protectedMedicine && (
                        <span className="text-sm text-muted-foreground">{item.dispensedQty} already dispensed</span>
                      )}
                    </div>
                    {protectedMedicine && (
                      <p className="text-sm text-muted-foreground">Dispensed quantity is protected and cannot be edited.</p>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor={`correction-item-${index}-quantity`}>
                          {isOtherCharge ? `${item.itemName} quantity` : `${item.itemName} quantity`}
                        </Label>
                        <Input
                          id={`correction-item-${index}-quantity`}
                          type="number"
                          min={item.dispensedQty ?? 0}
                          max="1000000"
                          step="1"
                          value={item.quantity}
                          disabled={isSubmitting}
                          onChange={(event) => updateItem(index, { quantity: numberValue(event.target.value) })}
                        />
                        {errors[`items.${index}.quantity`] && <p className="text-sm text-destructive">{errors[`items.${index}.quantity`]}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`correction-item-${index}-price`}>
                          {isOtherCharge ? `${item.itemName} amount (RM)` : `${item.itemName} price (RM)`}
                        </Label>
                        <Input
                          id={`correction-item-${index}-price`}
                          type="number"
                          min="0"
                          max="99999999.99"
                          step="0.01"
                          value={item.price}
                          disabled={isSubmitting}
                          onChange={(event) => updateItem(index, { price: numberValue(event.target.value) })}
                        />
                        {errors[`items.${index}.price`] && <p className="text-sm text-destructive">{errors[`items.${index}.price`]}</p>}
                      </div>
                      <div className="flex items-end gap-2">
                        {isNewCharge ? (
                          <Button type="button" variant="outline" onClick={() => removeNewCharge(index)} disabled={isSubmitting}>
                            Remove charge
                          </Button>
                        ) : (
                          <>
                            <Checkbox
                              id={`correction-item-${index}-remove`}
                              checked={item.remove}
                              disabled={protectedMedicine || isSubmitting}
                              onCheckedChange={(checked) => updateItem(index, { remove: checked === true })}
                            />
                            <Label htmlFor={`correction-item-${index}-remove`}>Remove {item.itemName}</Label>
                          </>
                        )}
                      </div>
                    </div>
                    {errors[`items.${index}.remove`] && <p className="text-sm text-destructive">{errors[`items.${index}.remove`]}</p>}
                  </div>
                );
              })}
              <div className="space-y-1">
                <Label htmlFor="add-other-charge">Add other charge</Label>
                <select
                  id="add-other-charge"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                  disabled={isSubmitting || chargeTypes.length === 0}
                  onChange={(event) => {
                    if (event.target.value) addOtherCharge(event.target.value);
                    event.target.value = '';
                  }}
                >
                  <option value="">Select a configured charge…</option>
                  {chargeTypes.map((charge) => (
                    <option key={charge.id} value={charge.id}>{charge.name}</option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">Only active, configured other charges can be added.</p>
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="payments-heading">
              <h3 id="payments-heading" className="font-medium">Existing payments</h3>
              <p className="text-sm text-muted-foreground">To add a payment after correcting this bill, use Record Payment.</p>
              {draft.payments.map((payment, index) => {
                const hasSupportedMethod = PAYMENT_METHOD_OPTIONS.some((option) => option.value === payment.paymentMethod)
                  || payment.paymentMethod === 'panel';
                return (
                  <div key={payment.id} className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`correction-payment-${index}-amount`}>Payment {index + 1} amount (RM)</Label>
                      <Input
                        id={`correction-payment-${index}-amount`}
                        type="number"
                        min="0"
                        max="999999999.99"
                        step="0.01"
                        value={payment.amount}
                        disabled={isSubmitting}
                        onChange={(event) => updatePayment(index, { amount: numberValue(event.target.value) })}
                      />
                      {errors[`payments.${index}.amount`] && <p className="text-sm text-destructive">{errors[`payments.${index}.amount`]}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`correction-payment-${index}-method`}>Payment {index + 1} method</Label>
                      <Select
                        value={payment.paymentMethod}
                        disabled={isSubmitting}
                        onValueChange={(paymentMethod) => updatePayment(index, { paymentMethod })}
                      >
                        <SelectTrigger id={`correction-payment-${index}-method`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {!hasSupportedMethod && <SelectItem value={payment.paymentMethod} disabled>Choose a supported method</SelectItem>}
                          {PAYMENT_METHOD_OPTIONS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}
                          <SelectItem value="panel">Panel</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors[`payments.${index}.paymentMethod`] && <p className="text-sm text-destructive">{errors[`payments.${index}.paymentMethod`]}</p>}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Discount and tax">
              <div className="space-y-1">
                <Label htmlFor="correction-discount">Discount (RM)</Label>
                <Input id="correction-discount" type="number" min="0" max="99999999.99" step="0.01" value={draft.discountRm} disabled={isSubmitting} onChange={(event) => setDraft({ ...draft, discountRm: numberValue(event.target.value) })} />
                {errors.discountRm && <p className="text-sm text-destructive">{errors.discountRm}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="correction-tax">Tax (%)</Label>
                <Input id="correction-tax" type="number" min="0" max="100" step="0.01" value={draft.taxPct} disabled={isSubmitting} onChange={(event) => setDraft({ ...draft, taxPct: numberValue(event.target.value) })} />
                {errors.taxPct && <p className="text-sm text-destructive">{errors.taxPct}</p>}
              </div>
            </section>

            <div className="space-y-1">
              <Label htmlFor="correction-reason">Correction reason</Label>
              <Textarea id="correction-reason" required value={draft.reason} disabled={isSubmitting} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
              {errors.reason && <p className="text-sm text-destructive">{errors.reason}</p>}
            </div>

            <section className="rounded-md bg-muted/50 p-3 space-y-2" aria-label="Correction totals">
              <p>Original total: {money(originalTotals.total)}</p>
              <p>Corrected total: {money(totals.total)}</p>
              <p>Paid: {money(totals.paid)}</p>
              {totals.outstanding > 0 && <Alert>Outstanding: {money(totals.outstanding)}</Alert>}
              {totals.creditDue > 0 && <Alert>Refund/Credit Due: {money(totals.creditDue)}</Alert>}
              {totals.status === 'paid' && <Badge>Paid</Badge>}
            </section>

            {context.panelClaim && (
              <section className="rounded-md border p-3 space-y-1" aria-label="Panel claim reconciliation">
                <h3 className="font-medium">Panel claim reconciliation</h3>
                <p>Claim status: {context.panelClaim.status}</p>
                <p>Claim amount: {money(context.panelClaim.amount)}</p>
                {context.panelClaim.receivedAmount !== null && <p>Received: {money(context.panelClaim.receivedAmount)}</p>}
                {context.panelClaim.receivedAmount !== null && context.panelClaim.receivedAmount > context.panelClaim.amount && (
                  <p>Panel credit due: {money(context.panelClaim.receivedAmount - context.panelClaim.amount)}</p>
                )}
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!draft || !context || Object.keys(errors).length > 0 || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Correcting…' : 'Confirm correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
