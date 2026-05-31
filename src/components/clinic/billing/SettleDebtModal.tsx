import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/clinic/paymentMethod';
import { formatRm } from '@/hooks/clinic/usePatientFinancials';
import { toMalayTitleCase } from '@/lib/textCase';
import { cn } from '@/lib/utils';
import { PrintReceiptDialog } from './PrintReceiptDialog';
import type { QueueEntryWithJoins } from '@/types/clinic';

interface Props {
  entry: QueueEntryWithJoins | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UnpaidVisit {
  consultation_id: string;
  created_at: string;
  doctor_name: string | null;
  total: number;
  paid: number;
  outstanding: number;
}

function useUnpaidVisits(patientId: string | null | undefined) {
  return useQuery<UnpaidVisit[]>({
    queryKey: ['debt', 'unpaid-visits', patientId ?? ''],
    enabled: !!patientId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data: cs, error } = await supabase
        .from('consultations')
        .select(
          `id, created_at, doctors:doctor_id ( name ),
           consultation_items!left ( price, quantity, deleted_at ),
           payments!left ( amount, deleted_at )`,
        )
        .eq('patient_id', patientId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows: UnpaidVisit[] = [];
      for (const c of cs ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = ((c as any).consultation_items ?? []) as Array<{
          price: number | null;
          quantity: number | null;
          deleted_at: string | null;
        }>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pays = ((c as any).payments ?? []) as Array<{
          amount: number | null;
          deleted_at: string | null;
        }>;
        const total = items
          .filter((i) => !i.deleted_at)
          .reduce((a, i) => a + Number(i.price ?? 0) * Number(i.quantity ?? 0), 0);
        const paid = pays
          .filter((p) => !p.deleted_at)
          .reduce((a, p) => a + Number(p.amount ?? 0), 0);
        const outstanding = +(total - paid).toFixed(2);
        if (outstanding > 0.005) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (c as any).doctors;
          rows.push({
            consultation_id: c.id as string,
            created_at: c.created_at as string,
            doctor_name: Array.isArray(doc) ? doc[0]?.name ?? null : doc?.name ?? null,
            total,
            paid,
            outstanding,
          });
        }
      }
      return rows;
    },
  });
}

export function SettleDebtModal({ entry, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const patientId = entry?.patient_id ?? null;
  const { data: visits = [], isLoading } = useUnpaidVisits(patientId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountInput, setAmountInput] = useState<string>('');
  const [userEditedAmount, setUserEditedAmount] = useState(false);
  const [method, setMethod] = useState<string>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [zeroConfirm, setZeroConfirm] = useState(false);
  const [printPaymentId, setPrintPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setAmountInput('');
      setUserEditedAmount(false);
      setMethod('cash');
      setNotes('');
      setSubmitting(false);
      setZeroConfirm(false);
      setPrintPaymentId(null);
    }
  }, [open]);

  const selectedRows = useMemo(
    () => visits.filter((v) => selected.has(v.consultation_id)),
    [visits, selected],
  );
  const selectedTotal = useMemo(
    () => +selectedRows.reduce((a, v) => a + v.outstanding, 0).toFixed(2),
    [selectedRows],
  );

  useEffect(() => {
    if (!userEditedAmount) {
      setAmountInput(selectedTotal > 0 ? selectedTotal.toFixed(2) : '0.00');
    }
  }, [selectedTotal, userEditedAmount]);

  const amountNum = parseFloat(amountInput);
  const amount = Number.isFinite(amountNum) ? Math.max(amountNum, 0) : 0;
  const overpaid = amount > selectedTotal + 0.0001;
  const remaining = Math.max(selectedTotal - amount, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setUserEditedAmount(false);
  };

  const toggleAll = () => {
    if (selected.size === visits.length) setSelected(new Set());
    else setSelected(new Set(visits.map((v) => v.consultation_id)));
    setUserEditedAmount(false);
  };

  const canSubmit = (() => {
    if (submitting || overpaid) return false;
    if (amount === 0) return true;
    if (selectedRows.length === 0) return false;
    if (!method) return false;
    return true;
  })();

  const buttonLabel = amount === 0
    ? 'Close Ticket (RM 0)'
    : `Settle ${selectedRows.length} Visit${selectedRows.length === 1 ? '' : 's'} · ${formatRm(amount)}`;

  const submit = async () => {
    if (!entry) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('settle_multiple_debts', {
        p_queue_entry_id: entry.id,
        p_consultation_ids: selectedRows.map((v) => v.consultation_id),
        p_amount_paid: amount,
        p_payment_method: amount > 0 ? method : null,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      const result = (data ?? {}) as {
        payment_ids?: string[];
        total_collected?: number;
        debt_remaining?: number;
      };
      qc.invalidateQueries({ queryKey: ['clinic', 'queue-entries'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['patient_outstanding', patientId ?? ''] });
      qc.invalidateQueries({ queryKey: ['debt', 'unpaid-visits', patientId ?? ''] });

      const collected = Number(result.total_collected ?? 0);
      const debtLeft = Number(result.debt_remaining ?? 0);

      if (collected === 0) {
        toast.success('Ticket closed — no payment collected');
      } else if (debtLeft > 0.005) {
        toast.success(
          `Collected ${formatRm(collected)} · ${formatRm(debtLeft)} debt remaining`,
        );
      } else {
        toast.success(`Collected ${formatRm(collected)} · All selected debt cleared`);
      }

      const firstPaymentId = result.payment_ids?.[0] ?? null;
      if (firstPaymentId) {
        setPrintPaymentId(firstPaymentId);
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to settle debt';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitClick = () => {
    if (!canSubmit) return;
    if (amount === 0) {
      setZeroConfirm(true);
      return;
    }
    submit();
  };

  const patientName = entry?.patients?.name
    ? toMalayTitleCase(entry.patients.name)
    : 'Patient';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Settle Past Debt — {patientName}</DialogTitle>
            <DialogDescription>
              Select one or more unpaid visits. Payment is allocated oldest-first.
              Set amount to RM 0 to close this ticket without collecting.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {isLoading
                  ? 'Loading unpaid visits…'
                  : `${visits.length} unpaid visit${visits.length === 1 ? '' : 's'}`}
              </span>
              {visits.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-blue-600 hover:underline"
                  onClick={toggleAll}
                >
                  {selected.size === visits.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-[200px] max-h-[40vh] rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              ) : visits.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  No unpaid visits for this patient.
                </div>
              ) : (
                <ul className="divide-y">
                  {visits.map((v) => {
                    const checked = selected.has(v.consultation_id);
                    return (
                      <li
                        key={v.consultation_id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50',
                          checked && 'bg-blue-50/40',
                        )}
                        onClick={() => toggle(v.consultation_id)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(v.consultation_id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="text-sm font-medium text-slate-800">
                              {format(new Date(v.created_at), 'd MMM yyyy')}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {v.doctor_name ? `Dr. ${v.doctor_name}` : 'Counter sale'}
                            </p>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Total {formatRm(v.total)} · Paid {formatRm(v.paid)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-rose-600 tabular-nums">
                          {formatRm(v.outstanding)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>

            <div className="rounded-md border bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="settle-amount" className="text-xs">
                    Amount Paid (RM)
                  </Label>
                  <Input
                    id="settle-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={selectedTotal}
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => {
                      setUserEditedAmount(true);
                      setAmountInput(e.target.value);
                    }}
                    onBlur={() => {
                      if (amount > selectedTotal) {
                        setAmountInput(selectedTotal.toFixed(2));
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="settle-method" className="text-xs">
                    Payment Method {amount > 0 && '*'}
                  </Label>
                  <Select
                    value={method}
                    onValueChange={setMethod}
                    disabled={amount === 0}
                  >
                    <SelectTrigger id="settle-method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Textarea
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Cash from spouse"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <div>
                  Settling <span className="font-semibold">{selectedRows.length}</span>{' '}
                  visit{selectedRows.length === 1 ? '' : 's'} · Selected{' '}
                  <span className="font-semibold tabular-nums">{formatRm(selectedTotal)}</span>{' '}
                  · Paying{' '}
                  <span className="font-semibold tabular-nums">{formatRm(amount)}</span>
                </div>
                {remaining > 0.005 && (
                  <div className="text-amber-700">
                    Remaining debt: <span className="font-semibold tabular-nums">{formatRm(remaining)}</span>
                  </div>
                )}
              </div>
              {overpaid && (
                <p className="text-xs text-rose-600">
                  Amount exceeds selected outstanding total.
                </p>
              )}
              {amount > 0 && selectedRows.length === 0 && (
                <p className="text-xs text-rose-600">
                  Select at least one visit to allocate this payment to.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmitClick}
              className={amount === 0 ? '' : ''}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {buttonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={zeroConfirm} onOpenChange={setZeroConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close ticket without collecting payment?</AlertDialogTitle>
            <AlertDialogDescription>
              The patient's outstanding debt will remain on their historical visits.
              The queue ticket will be cleared from the board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setZeroConfirm(false);
                submit();
              }}
            >
              Close Ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrintReceiptDialog
        open={!!printPaymentId}
        onOpenChange={(o) => {
          if (!o) {
            setPrintPaymentId(null);
            onOpenChange(false);
          }
        }}
        paymentId={printPaymentId}
      />
    </>
  );
}
