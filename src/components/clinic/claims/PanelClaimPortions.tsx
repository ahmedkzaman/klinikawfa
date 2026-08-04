import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  malaysiaTodayIso,
  parseMoneyInputToCents,
  type PanelClaimPortion,
  type PanelClaimPortionStatus,
} from '@/lib/clinic/panelClaimPortions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { bento, bentoHeader, fieldLabel, primaryBtn, secondaryBtn, softInput } from '@/lib/clinic/bentoTokens';

export interface PortionPaymentInput {
  portionId: string;
  amount: number;
  receivedDate: string;
  paymentReference: string;
  remark: string;
  idempotencyKey: string;
}

interface PanelClaimPortionsProps {
  portions: PanelClaimPortion[];
  canReceivePayments: boolean;
  onReceivePayment: (payment: PortionPaymentInput) => Promise<void>;
}

interface ReceiptDraft {
  amount: string;
  receivedDate: string;
  paymentReference: string;
  remark: string;
  idempotencyKey: string | null;
}

function formatRM(value: number): string {
  return `RM ${value.toFixed(2)}`;
}

function statusLabel(status: PanelClaimPortion['status']): string {
  return status === 'partially_paid' ? 'Partially paid' : status[0].toUpperCase() + status.slice(1);
}

function statusClass(status: PanelClaimPortion['status']): string {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-700';
  if (status === 'partially_paid') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function emptyReceiptDraft(): ReceiptDraft {
  return {
    amount: '',
    receivedDate: malaysiaTodayIso(),
    paymentReference: '',
    remark: '',
    idempotencyKey: null,
  };
}

export function PanelClaimPortions({ portions, canReceivePayments, onReceivePayment }: PanelClaimPortionsProps) {
  const [activePortionId, setActivePortionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft>(emptyReceiptDraft);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PanelClaimPortionStatus | 'all'>('all');

  const activePortion = portions.find((portion) => portion.id === activePortionId) ?? null;
  const balanceCents = activePortion
    ? Math.max(
      Math.round(activePortion.amount * 100) - Math.round(activePortion.received_amount * 100),
      0,
    )
    : 0;
  const balance = balanceCents / 100;
  const visiblePortions = statusFilter === 'all'
    ? portions
    : portions.filter((portion) => portion.status === statusFilter);

  function closeReceiptDialog() {
    setActivePortionId(null);
    setDraft(emptyReceiptDraft());
    setError(null);
  }

  function openReceiptDialog(portion: PanelClaimPortion) {
    setActivePortionId(portion.id);
    setDraft(emptyReceiptDraft());
    setError(null);
  }

  useEffect(() => {
    if (activePortionId && (!activePortion || balanceCents <= 0 || !canReceivePayments)) {
      closeReceiptDialog();
    }
  }, [activePortion, activePortionId, balanceCents, canReceivePayments]);

  async function submitReceipt() {
    if (!activePortion) return;
    const amountCents = parseMoneyInputToCents(draft.amount);
    if (!draft.paymentReference.trim()) {
      setError('Payment reference is required.');
      return;
    }
    if (!draft.receivedDate) {
      setError('Payment date is required.');
      return;
    }
    if (amountCents === null) {
      setError('Enter a positive amount with up to two decimal places.');
      return;
    }
    if (amountCents > balanceCents) {
      setError(`Payment amount must not exceed ${formatRM(balance)}.`);
      return;
    }

    const idempotencyKey = draft.idempotencyKey ?? crypto.randomUUID();
    if (!draft.idempotencyKey) setDraft((current) => ({ ...current, idempotencyKey }));
    setSubmitting(true);
    setError(null);
    try {
      await onReceivePayment({
        portionId: activePortion.id,
        amount: amountCents / 100,
        receivedDate: draft.receivedDate,
        paymentReference: draft.paymentReference.trim(),
        remark: draft.remark.trim(),
        idempotencyKey,
      });
      closeReceiptDialog();
    } catch (receiptError) {
      setError(receiptError instanceof Error ? receiptError.message : 'Failed to save receipt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={cn(bento, 'p-4 sm:p-5')} aria-labelledby="portion-ledger-heading">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="portion-ledger-heading" className={bentoHeader}>Portion ledger</h3>
          <p className="text-sm text-slate-500">Receipts are recorded against each approval portion.</p>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as PanelClaimPortionStatus | 'all')}
        >
          <SelectTrigger className="h-9 w-40" aria-label="Portion status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All portions</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partially_paid">Partially paid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {visiblePortions.map((portion) => {
          const portionBalanceCents = Math.max(
            Math.round(portion.amount * 100) - Math.round(portion.received_amount * 100),
            0,
          );
          const portionBalance = portionBalanceCents / 100;
          const canReceive = canReceivePayments && portionBalanceCents > 0;
          return (
            <article key={portion.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-700">#{portion.portion_no}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', statusClass(portion.status))}>
                    {statusLabel(portion.status)}
                  </span>
                </div>
                {canReceive && (
                  <Button
                    type="button"
                    size="sm"
                    className={primaryBtn}
                    aria-label={`Receive payment for portion ${portion.portion_no}`}
                    onClick={() => openReceiptDialog(portion)}
                  >
                    Receive payment
                  </Button>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
                <LedgerValue label="Billed" value={formatRM(portion.amount)} />
                <LedgerValue label="Received" value={formatRM(portion.received_amount)} />
                <LedgerValue label="Balance" value={formatRM(portionBalance)} />
                <LedgerValue label="Reference" value={portion.payment_reference ?? '—'} />
                <LedgerValue label="Receipt date" value={portion.received_date ?? '—'} />
                <LedgerValue label="Remarks" value={portion.remark || '—'} className="col-span-2 sm:col-span-3" />
              </dl>
            </article>
          );
        })}
      </div>

      <Dialog open={activePortion !== null} onOpenChange={(open) => !open && closeReceiptDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receive payment</DialogTitle>
            <DialogDescription>
              Portion #{activePortion?.portion_no} has {formatRM(balance)} outstanding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="portion-payment-reference" className={fieldLabel}>Payment reference *</Label>
              <Input id="portion-payment-reference" value={draft.paymentReference} onChange={(event) => setDraft((current) => ({ ...current, paymentReference: event.target.value }))} className={softInput} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="portion-payment-date" className={fieldLabel}>Payment date *</Label>
                <Input id="portion-payment-date" type="date" value={draft.receivedDate} onChange={(event) => setDraft((current) => ({ ...current, receivedDate: event.target.value }))} className={softInput} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portion-payment-amount" className={fieldLabel}>Payment amount (RM) *</Label>
                <Input id="portion-payment-amount" type="text" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} className={softInput} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portion-payment-remark" className={fieldLabel}>Receipt remarks</Label>
              <Textarea id="portion-payment-remark" rows={2} value={draft.remark} onChange={(event) => setDraft((current) => ({ ...current, remark: event.target.value }))} className={softInput} />
            </div>
            {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" className={secondaryBtn} onClick={closeReceiptDialog} disabled={submitting}>Cancel</Button>
            <Button type="button" className={primaryBtn} onClick={submitReceipt} disabled={submitting}>{submitting ? 'Saving…' : 'Save receipt'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LedgerValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className={fieldLabel}>{label}</dt>
      <dd className="mt-0.5 break-words font-medium tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
