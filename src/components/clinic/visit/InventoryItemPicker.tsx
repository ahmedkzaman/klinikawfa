import { useMemo, useState } from 'react';
import { Search, Plus, ShoppingBag, Pill } from 'lucide-react';
import { toast } from 'sonner';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useInventoryItemsSafe } from '@/hooks/clinic/useInventoryItems';
import { useAddConsultationItem } from '@/hooks/clinic/useConsultationItems';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';
import type { ConsultationItemRow } from '@/types/clinic';

interface Props {
  consultationId: string | null;
  disabled?: boolean;
  /**
   * `direct_sale` — counter sales: hard OTC-only filter, amber warning banner.
   * `consultation` — nurse/ops add-on during a doctor's visit: full inventory.
   * Defaults to `direct_sale` for safety.
   */
  mode?: 'direct_sale' | 'consultation';
  /**
   * Fired after a row is inserted. DispenseCheckout uses this to auto-open the
   * EditInstructionsDialog when a non-OTC medicine is added during a
   * consultation, forcing dosage/frequency entry before label print.
   */
  onItemAdded?: (row: ConsultationItemRow) => void;
}

/**
 * Inventory picker used by the Dispensary checkout for both Direct Sale visits
 * (OTC-only, hard-locked) and standard consultations (full catalog, with
 * clinical-safety auto-open of the instructions dialog).
 */
export function InventoryItemPicker({
  consultationId,
  disabled,
  mode = 'direct_sale',
  onItemAdded,
}: Props) {
  const onlyOtc = mode === 'direct_sale';
  const { data: items = [], isLoading } = useInventoryItemsSafe({ onlyOtc });
  const addItem = useAddConsultationItem();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [picked, setPicked] = useState<any | null>(null);

  const placeholder =
    mode === 'direct_sale'
      ? 'Search OTC items only…'
      : 'Search full inventory (verbal order / add-on)…';
  const emptyText = mode === 'direct_sale' ? 'No OTC items match.' : 'No items match.';
  const headerText =
    mode === 'direct_sale' ? 'Direct Sale — Add OTC Items' : 'Add Item to Consultation';
  const HeaderIcon = mode === 'direct_sale' ? ShoppingBag : Pill;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((i: any) => String(i.name ?? '').toLowerCase().includes(q));
  }, [items, query]);

  const handleAdd = async () => {
    if (!consultationId) {
      toast.error('Preparing session… please try again in a moment.');
      return;
    }
    if (!picked) {
      toast.error('Select an item first');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = picked as any;
    if (mode === 'direct_sale' && !p.is_otc) {
      toast.error('Only OTC items can be sold via Direct Sale');
      return;
    }
    try {
      const inserted = await addItem.mutateAsync({
        consultation_id: consultationId,
        item_name: p.name,
        quantity: Math.max(1, Math.floor(qty || 1)),
        item_id: p.id,
      });
      toast.success(`Added ${p.name}`);

      // Clinical-safety: when adding a prescription medicine during a
      // consultation, force the dosage/instructions modal open immediately so
      // the patient never walks out with a blank drug label.
      if (
        mode === 'consultation' &&
        p.is_otc === false &&
        inserted &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (inserted as any).item_id
      ) {
        onItemAdded?.(inserted as ConsultationItemRow);
      }

      setPicked(null);
      setQty(1);
      setQuery('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add item';
      if (!msg.toLowerCase().includes('stock')) toast.error(msg);
    }
  };

  return (
    <div className={cn(bento, 'p-4 space-y-3')}>
      <div className="flex items-center gap-2">
        <HeaderIcon className="h-4 w-4 text-primary" />
        <h2 className={bentoHeader}>{headerText}</h2>
      </div>

      {mode === 'direct_sale' ? (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTitle className="text-amber-900 font-semibold text-sm">
            OTC-only catalog
          </AlertTitle>
          <AlertDescription className="text-amber-900/90 text-xs">
            Only items marked <span className="font-semibold">OTC Approved</span> in Inventory
            Settings appear here. Prescription-only items are hidden.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-xs text-muted-foreground">
          Note: Adding items to a doctor's consultation. Stock will be reserved immediately.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Item</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
                disabled={disabled}
              >
                <span className="flex items-center gap-2 truncate">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {picked
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ? (picked as any).name
                      : placeholder}
                  </span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={placeholder}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {isLoading ? (
                    <CommandEmpty>Loading…</CommandEmpty>
                  ) : filtered.length === 0 ? (
                    <CommandEmpty>{emptyText}</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {filtered.slice(0, 50).map((i: any) => (
                        <CommandItem
                          key={i.id}
                          value={i.id}
                          onSelect={() => {
                            setPicked(i);
                            setOpen(false);
                          }}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{i.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              Stock: {i.stock ?? 0}
                              {i.uom ? ` · ${i.uom}` : ''}
                            </p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-slate-700">
                            RM {Number(i.price_to_patient_max ?? 0).toFixed(2)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Qty</label>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          onClick={handleAdd}
          disabled={disabled || !picked || addItem.isPending}
        >
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}
