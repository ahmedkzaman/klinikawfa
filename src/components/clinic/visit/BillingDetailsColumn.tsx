import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, Receipt, Printer } from 'lucide-react';
import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useVoidPayment } from '@/hooks/clinic/usePayments';
import { useClinicChargeTypes } from '@/hooks/clinic/useClinicChargeTypes';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHOD_OPTIONS,
  formatPaymentMethod,
  paymentMethodBadgeClass,
} from '@/lib/clinic/paymentMethod';
import { RecordPaymentDialog } from './RecordPaymentDialog';
import type { ConsultationItemRow, PaymentRow } from '@/types/clinic';

export interface SelectedCharge {
  charge_type_id: string;
  name: string;
  amount: number;
}

interface Props {
  queueEntryId: string;
  consultationId: string | null;
  items: ConsultationItemRow[];
  payments: PaymentRow[];
  /** When true, render the "Other Charges" picker. Selections are NOT
   *  persisted on toggle — parent commits them at checkout via onChargesChange. */
  showOtherCharges?: boolean;
  onChargesChange?: (charges: SelectedCharge[]) => void;
  onTotalsChange?: (totals: {
    subtotal: number;
    total: number;
    paid: number;
    outstanding: number;
  }) => void;
}

export function BillingDetailsColumn({
  queueEntryId,
  consultationId,
  items,
  payments,
  showOtherCharges = false,
  onChargesChange,
}: Props) {
  const { isSpecialAdmin } = useAuth();
  const voidPayment = useVoidPayment();
  const { data: chargeTypes = [] } = useClinicChargeTypes({ activeOnly: true });

  const [taxPct, setTaxPct] = useState<number>(0);
  const [discountRm, setDiscountRm] = useState<number>(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [printPaymentId, setPrintPaymentId] = useState<string | null>(null);



  // Local-only Other Charges state (committed to DB on Complete Checkout)
  const [selectedCharges, setSelectedCharges] = useState<
    Record<string, number>
  >({});

  const subtotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dispensed = (item as any).dispensed_qty as number | null;
        const qty =
          dispensed != null && item.item_id ? dispensed : Number(item.quantity ?? 0);
        return acc + Number(item.price ?? 0) * qty;
      }, 0),
    [items],
  );

  const otherChargesTotal = useMemo(
    () =>
      Object.values(selectedCharges).reduce(
        (a, v) => a + (Number(v) || 0),
        0,
      ),
    [selectedCharges],
  );

  // Bubble selections up so the checkout page can commit them.
  useEffect(() => {
    if (!onChargesChange) return;
    const list: SelectedCharge[] = Object.entries(selectedCharges)
      .map(([id, amount]) => {
        const ct = chargeTypes.find((c) => c.id === id);
        return ct ? { charge_type_id: id, name: ct.name, amount } : null;
      })
      .filter((x): x is SelectedCharge => x !== null);
    onChargesChange(list);
  }, [selectedCharges, chargeTypes, onChargesChange]);

  const subtotalWithCharges = subtotal + otherChargesTotal;
  const afterDiscount = Math.max(subtotalWithCharges - discountRm, 0);
  const total = afterDiscount * (1 + taxPct / 100);
  const paid = useMemo(
    () => payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0),
    [payments],
  );
  const outstanding = Math.max(total - paid, 0);

  const handleVoid = async (id: string) => {
    if (!confirm('Void this payment? This action is logged.')) return;
    try {
      await voidPayment.mutateAsync({ id, queue_entry_id: queueEntryId });
    } catch {
      // surfaced by hook
    }
  };

  const toggleCharge = (id: string, checked: boolean, defaultAmt: number) => {
    setSelectedCharges((prev) => {
      const next = { ...prev };
      if (checked) next[id] = defaultAmt;
      else delete next[id];
      return next;
    });
  };

  const updateChargeAmount = (id: string, value: string) => {
    setSelectedCharges((prev) => ({
      ...prev,
      [id]: parseFloat(value) || 0,
    }));
  };

  return (
    <>
      <div className="rounded-xl bg-card border flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Billing</h2>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <Row label="Subtotal" value={`RM ${subtotal.toFixed(2)}`} />

          {showOtherCharges && chargeTypes.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Other Charges
              </div>
              <div className="space-y-1.5">
                {chargeTypes.map((ct) => {
                  const checked = ct.id in selectedCharges;
                  return (
                    <div
                      key={ct.id}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`charge-${ct.id}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          toggleCharge(
                            ct.id,
                            v === true,
                            Number(ct.default_amount) || 0,
                          )
                        }
                      />
                      <Label
                        htmlFor={`charge-${ct.id}`}
                        className="flex-1 text-xs font-normal cursor-pointer"
                      >
                        {ct.name}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-7 w-20 text-xs tabular-nums"
                        value={
                          checked
                            ? selectedCharges[ct.id]
                            : Number(ct.default_amount) || 0
                        }
                        disabled={!checked}
                        onChange={(e) =>
                          updateChargeAmount(ct.id, e.target.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {otherChargesTotal > 0 && (
                <Row
                  label="Charges subtotal"
                  value={`RM ${otherChargesTotal.toFixed(2)}`}
                  muted
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="tax" className="text-xs text-muted-foreground">
                Tax %
              </Label>
              <Input
                id="tax"
                type="number"
                min="0"
                step="0.1"
                className="h-8"
                value={taxPct}
                onChange={(e) => setTaxPct(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="disc" className="text-xs text-muted-foreground">
                Discount (RM)
              </Label>
              <Input
                id="disc"
                type="number"
                min="0"
                step="0.01"
                className="h-8"
                value={discountRm}
                onChange={(e) => setDiscountRm(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <Row label="Total" value={`RM ${total.toFixed(2)}`} bold />
          <Row label="Paid" value={`RM ${paid.toFixed(2)}`} muted />
          <Row
            label="Outstanding"
            value={`RM ${outstanding.toFixed(2)}`}
            bold
            highlight={outstanding > 0}
          />
        </div>

        <div className="px-4 pb-3 space-y-2">
          {outstanding > 0 && (
            <div className="space-y-1">
              <Label htmlFor="pay-method-inline" className="text-xs text-muted-foreground">
                Payment Method
              </Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="pay-method-inline" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            type="button"
            className="w-full"
            onClick={() => setDialogOpen(true)}
            disabled={!queueEntryId}
          >
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        </div>


        <div className="border-t border-border">
          <div className="px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Payments
          </div>
          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Receipt className="h-8 w-8 mb-1.5 opacity-20" />
              <p className="text-xs">No payments recorded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="px-4 py-2.5 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] py-0 px-1.5 h-5',
                          paymentMethodBadgeClass(p.payment_method),
                        )}
                      >
                        {formatPaymentMethod(p.payment_method, Number(p.amount ?? 0))}
                      </Badge>

                      <span className="text-[11px] text-muted-foreground capitalize">
                        {(p.payment_type ?? '').replace('_', '-')}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {format(new Date(p.created_at), 'd MMM, h:mm a')}
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    RM {Number(p.amount ?? 0).toFixed(2)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setPrintPaymentId(p.id)}
                    aria-label="Print receipt"
                    title="Print receipt"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  {isSpecialAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleVoid(p.id)}
                      aria-label="Void payment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        queueEntryId={queueEntryId}
        consultationId={consultationId}
        defaultAmount={outstanding}
        defaultPaymentMethod={paymentMethod}

      />

      <PrintReceiptDialog
        open={!!printPaymentId}
        onOpenChange={(o) => !o && setPrintPaymentId(null)}
        paymentId={printPaymentId}
      />
    </>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          muted
            ? 'text-muted-foreground'
            : bold
              ? 'font-medium text-foreground'
              : 'text-foreground'
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          highlight
            ? 'text-destructive font-semibold'
            : bold
              ? 'font-semibold text-foreground'
              : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
