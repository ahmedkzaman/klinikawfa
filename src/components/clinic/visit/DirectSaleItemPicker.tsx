import { useMemo, useState } from 'react';
import { Search, Plus, ShoppingBag } from 'lucide-react';
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

interface Props {
  consultationId: string | null;
  disabled?: boolean;
}

/**
 * OTC-only inventory picker shown on Direct Sale visits in DispenseCheckout.
 * Filters strictly by `is_otc = true` server-side via useInventoryItemsSafe({ onlyOtc: true }).
 */
export function DirectSaleItemPicker({ consultationId, disabled }: Props) {
  const { data: items = [], isLoading } = useInventoryItemsSafe({ onlyOtc: true });
  const addItem = useAddConsultationItem();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [picked, setPicked] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((i: any) => String(i.name ?? '').toLowerCase().includes(q));
  }, [items, query]);

  const handleAdd = async () => {
    if (!consultationId) {
      toast.error('Preparing direct-sale session… please try again in a moment.');
      return;
    }
    if (!picked) {
      toast.error('Select an OTC item first');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = picked as any;
    if (!p.is_otc) {
      toast.error('Only OTC items can be sold via Direct Sale');
      return;
    }
    try {
      await addItem.mutateAsync({
        consultation_id: consultationId,
        item_name: p.name,
        quantity: Math.max(1, Math.floor(qty || 1)),
        item_id: p.id,
      });
      toast.success(`Added ${p.name}`);
      setPicked(null);
      setQty(1);
      setQuery('');
    } catch (err) {
      // toast already shown by hook in most cases
      const msg = err instanceof Error ? err.message : 'Failed to add item';
      if (!msg.toLowerCase().includes('stock')) toast.error(msg);
    }
  };

  return (
    <div className={cn(bento, 'p-4 space-y-3')}>
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-primary" />
        <h2 className={bentoHeader}>Direct Sale — Add OTC Items</h2>
      </div>

      <Alert className="bg-amber-50 border-amber-200">
        <AlertTitle className="text-amber-900 font-semibold text-sm">
          OTC-only catalog
        </AlertTitle>
        <AlertDescription className="text-amber-900/90 text-xs">
          Only items marked <span className="font-semibold">OTC Approved</span> in Inventory
          Settings appear here. Prescription-only items are hidden.
        </AlertDescription>
      </Alert>

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
                      : 'Search OTC items only…'}
                  </span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search OTC items only…"
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {isLoading ? (
                    <CommandEmpty>Loading…</CommandEmpty>
                  ) : filtered.length === 0 ? (
                    <CommandEmpty>No OTC items match.</CommandEmpty>
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
