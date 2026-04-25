import { Trash2, Minus, Plus, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConsultationItems,
  useUpdateConsultationItem,
  useRemoveConsultationItem,
} from '@/hooks/clinic/useConsultationItems';
import { toast } from 'sonner';

interface Props {
  consultationId: string | undefined;
  canEdit?: boolean;
}

export function VisitDetailsColumn({ consultationId, canEdit = true }: Props) {
  const { data: items = [], isLoading } = useConsultationItems(consultationId);
  const updateItem = useUpdateConsultationItem();
  const removeItem = useRemoveConsultationItem();

  const handleQty = async (
    id: string,
    currentQty: number,
    delta: number,
  ) => {
    if (!consultationId) return;
    const next = currentQty + delta;
    if (next < 1) return;
    try {
      await updateItem.mutateAsync({
        id,
        consultationId,
        quantity: next,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!consultationId) return;
    try {
      await removeItem.mutateAsync({ id, consultationId });
      toast.success('Item removed');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="rounded-xl bg-card border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Prescribed Items</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canEdit
              ? 'Adjust quantities or remove items before checkout'
              : 'View only — locked by another user'}
          </p>
        </div>
        {!canEdit && (
          <span className="text-[10px] uppercase tracking-wide font-semibold rounded-full bg-muted text-muted-foreground px-2 py-0.5 shrink-0">
            View only
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Pill className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-sm font-medium">No items prescribed</p>
          <p className="text-xs mt-1">
            Items added by the doctor during consultation appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => {
            const lineTotal = Number(item.price ?? 0) * (item.quantity ?? 0);
            const dosageBits = [
              item.dosage,
              item.frequency,
              item.duration,
            ].filter(Boolean);
            return (
              <div
                key={item.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {item.item_name}
                  </div>
                  {dosageBits.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {dosageBits.join(' · ')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleQty(item.id, item.quantity ?? 1, -1)}
                    disabled={(item.quantity ?? 1) <= 1 || updateItem.isPending}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums">
                    {item.quantity ?? 1}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleQty(item.id, item.quantity ?? 1, 1)}
                    disabled={updateItem.isPending}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <div className="text-right shrink-0 w-24">
                  <div className="text-sm font-medium tabular-nums">
                    RM {lineTotal.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    @ RM {Number(item.price ?? 0).toFixed(2)}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(item.id)}
                  disabled={removeItem.isPending}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
