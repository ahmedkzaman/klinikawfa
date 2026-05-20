import { Pill, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DispenseItemRow } from './DispenseItemRow';
import type { ConsultationItemRow } from '@/types/clinic';

interface Props {
  items: ConsultationItemRow[];
  consultationId: string | null;
  panelDiscountPct?: number;
}

/**
 * Pharmacy-only dispense workspace shown above billing. Lists every medicine
 * line on the consultation (item_id != null) and lets the pharmacist record
 * the actual quantity handed to the patient. Reason is required for any
 * partial dispense — `out_of_stock` automatically triggers an owe-slip on
 * visit completion via the DB trigger.
 */
export function DispensePanel({ items, consultationId, panelDiscountPct = 0 }: Props) {
  if (!consultationId) return null;

  const meds = items.filter((it) => it.item_id);
  if (meds.length === 0) return null;

  const missingReason = meds.some((it) => {
    const prescribed = Number(it.quantity ?? 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispensed = (it as any).dispensed_qty as number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = (it as any).partial_reason as string | null;
    if (dispensed == null) return false;
    return dispensed < prescribed && !reason;
  });

  return (
    <div className="rounded-xl bg-card border border-border">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Pill className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Dispense Medicines</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          {meds.length} item{meds.length === 1 ? '' : 's'}
        </span>
      </div>

      {missingReason && (
        <Alert className="m-3 border-amber-300 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertDescription>
            Select a reason for every partially dispensed item before completing checkout.
          </AlertDescription>
        </Alert>
      )}

      {/* Header row */}
      <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="col-span-4">Medicine</div>
        <div className="col-span-2">Dispense Qty</div>
        <div className="col-span-3">Status / Reason</div>
        <div className="col-span-3 text-right">Line Total</div>
      </div>

      <div>
        {meds.map((it) => (
          <DispenseItemRow key={it.id} item={it} consultationId={consultationId} />
        ))}
      </div>
    </div>
  );
}
