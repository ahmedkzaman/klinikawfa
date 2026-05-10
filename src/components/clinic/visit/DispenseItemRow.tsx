import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateDispensedQty } from '@/hooks/clinic/useConsultationItems';
import type { ConsultationItemRow } from '@/types/clinic';
import { cn } from '@/lib/utils';

type Reason = 'patient_request' | 'out_of_stock';

interface Props {
  item: ConsultationItemRow;
  consultationId: string;
}

/**
 * Single editable medication line in the Dispense panel. Defaults to the
 * doctor's prescribed quantity; pharmacist may dial down. Auto-saves with a
 * 500ms debounce. When dispensed < prescribed, a reason picker is required —
 * `out_of_stock` will spawn a pharmacy_owe_slip on visit completion.
 */
export function DispenseItemRow({ item, consultationId }: Props) {
  const prescribed = Number(item.quantity ?? 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialDispensed = (item as any).dispensed_qty as number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialReason = (item as any).partial_reason as Reason | null;

  const [qty, setQty] = useState<number>(initialDispensed ?? prescribed);
  const [reason, setReason] = useState<Reason | ''>(initialReason ?? '');

  const update = useUpdateDispensedQty();
  const isPartial = qty < prescribed;

  // Debounced auto-save. Keep only one in-flight per row.
  useEffect(() => {
    const handler = setTimeout(() => {
      const targetReason: Reason | null = isPartial ? (reason || null) : null;
      const dirty =
        qty !== (initialDispensed ?? prescribed) ||
        targetReason !== (initialReason ?? null);
      if (!dirty) return;
      // Don't auto-save while we still need a reason — keep value local
      // until the pharmacist picks one, so we don't write half-state.
      if (isPartial && !targetReason) return;

      update.mutate({
        id: item.id,
        consultationId,
        dispensed_qty: qty,
        partial_reason: targetReason,
      });
    }, 500);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, reason]);

  const lineTotal = qty * Number(item.price ?? 0);
  const oweQty = isPartial && reason === 'out_of_stock' ? prescribed - qty : 0;

  return (
    <div className="grid grid-cols-12 gap-3 items-center px-3 py-2.5 border-t border-border first:border-t-0">
      {/* Name */}
      <div className="col-span-4 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">
          {item.item_name}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Prescribed: {prescribed}
        </div>
      </div>

      {/* Qty input */}
      <div className="col-span-2">
        <Input
          type="number"
          min={0}
          max={prescribed}
          step={1}
          value={qty}
          onChange={(e) => {
            const v = Number(e.target.value);
            const clamped = Math.max(0, Math.min(prescribed, isNaN(v) ? 0 : v));
            setQty(clamped);
            if (clamped >= prescribed) setReason('');
          }}
          className={cn(
            'h-8 text-sm tabular-nums',
            isPartial && 'border-amber-400 bg-amber-50 font-semibold text-amber-800',
          )}
        />
      </div>

      {/* Reason */}
      <div className="col-span-3">
        {isPartial ? (
          <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
            <SelectTrigger
              className={cn(
                'h-8 text-xs',
                !reason && 'border-destructive text-destructive',
              )}
            >
              <SelectValue placeholder="Reason required *" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="patient_request">Patient request</SelectItem>
              <SelectItem value="out_of_stock">Out of stock (Owe Slip)</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-2 h-5 border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            Full
          </Badge>
        )}
      </div>

      {/* Line total + owe badge */}
      <div className="col-span-3 text-right space-y-1">
        <div className="text-sm font-semibold text-foreground tabular-nums">
          RM {lineTotal.toFixed(2)}
        </div>
        {oweQty > 0 && (
          <Badge className="text-[10px] py-0 px-2 h-5 bg-amber-100 text-amber-800 hover:bg-amber-100">
            Owe: {oweQty}
          </Badge>
        )}
      </div>
    </div>
  );
}
