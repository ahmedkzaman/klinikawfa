import { useMemo, useState } from 'react';
import { Search, Plus, ShoppingBag, Pill, Stethoscope, Package } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInventoryItemsSafe } from '@/hooks/clinic/useInventoryItems';
import { useServicesSafe } from '@/hooks/clinic/useServices';
import { usePackagesSafe } from '@/hooks/clinic/usePackages';
import { useAddConsultationItem } from '@/hooks/clinic/useConsultationItems';
import { bento, bentoHeader } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';
import type { ConsultationItemRow } from '@/types/clinic';

type CatalogKind = 'inventory' | 'service' | 'package';

interface Props {
  consultationId: string | null;
  disabled?: boolean;
  /**
   * `direct_sale` — counter sales. Inventory tab is OTC-only with amber banner;
   *   Services and Packages remain fully available (clinic offerings, not POM).
   * `consultation` — full catalog across all three tabs.
   */
  mode?: 'direct_sale' | 'consultation';
  /**
   * Fired after a row is inserted. DispenseCheckout uses this to auto-open the
   * EditInstructionsDialog when a non-OTC inventory medicine is added during a
   * consultation. Services/packages do not trigger this hook.
   */
  onItemAdded?: (row: ConsultationItemRow) => void;
}

/**
 * Unified catalog picker for Dispensary checkout. Supports Inventory items,
 * Services (procedures / lab / other), and Packages — leveraging the
 * polymorphic `consultation_items` payload (item_id | service_id | package_id)
 * and the server-side `trg_resolve_selling_price` pricing trigger.
 */
export function CatalogItemPicker({
  consultationId,
  disabled,
  mode = 'direct_sale',
  onItemAdded,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogKind>('inventory');

  const { data: inventoryItems = [], isLoading: invLoading } = useInventoryItemsSafe();
  const { data: servicesRaw = [], isLoading: svcLoading } = useServicesSafe();
  const { data: packagesRaw = [], isLoading: pkgLoading } = usePackagesSafe();

  const services = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (servicesRaw as any[]).filter((s) => (s.status ?? 'active') === 'active'),
    [servicesRaw],
  );
  const packages = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (packagesRaw as any[]).filter((p) => (p.status ?? 'active') === 'active'),
    [packagesRaw],
  );

  const addItem = useAddConsultationItem();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState<number>(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [picked, setPicked] = useState<any | null>(null);

  const headerText =
    mode === 'direct_sale' ? 'Direct Sale — Add Item' : 'Add Item to Consultation';
  const HeaderIcon = mode === 'direct_sale' ? ShoppingBag : Pill;

  const placeholderByCatalog: Record<CatalogKind, string> = {
    inventory:
      mode === 'direct_sale'
        ? 'Search inventory (OTC only can be sold)…'
        : 'Search full inventory (verbal order / add-on)…',
    service: 'Search services (procedures, lab, other)…',
    package: 'Search packages…',
  };
  const emptyByCatalog: Record<CatalogKind, string> = {
    inventory: 'No items match.',
    service: 'No services match.',
    package: 'No packages match.',
  };

  const source = catalog === 'inventory' ? inventoryItems : catalog === 'service' ? services : packages;
  const isLoading = catalog === 'inventory' ? invLoading : catalog === 'service' ? svcLoading : pkgLoading;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (source as any[]).filter((i) => String(i.name ?? '').toLowerCase().includes(q));
  }, [source, query]);

  const resetPick = () => {
    setPicked(null);
    setQty(1);
    setQuery('');
  };

  const handleCatalogChange = (next: string) => {
    if (next === catalog) return;
    setCatalog(next as CatalogKind);
    resetPick();
  };

  const handleAdd = async () => {
    if (!consultationId) {
      toast.error('Error: No consultation ID found for this visit.');
      return;
    }
    if (!picked) {
      toast.error('Select an item first');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = picked as any;
    // Defensive fallback so the NOT NULL `price` column never trips before
    // `trg_resolve_selling_price` overwrites it for catalog-linked rows.
    const fallbackPrice = Number(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p as any).price_to_patient_max ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p as any).price_to_patient ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p as any).price ??
      0,
    );
    const payload: Parameters<typeof addItem.mutateAsync>[0] = {
      consultation_id: consultationId,
      item_name: p.name,
      quantity: Math.max(1, Math.floor(qty || 1)),
      price: fallbackPrice,
    };
    if (catalog === 'inventory') payload.item_id = p.id;
    else if (catalog === 'service') payload.service_id = p.id;
    else payload.package_id = p.id;

    try {
      const inserted = await addItem.mutateAsync(payload);
      toast.success(`Added ${p.name}`);

      // Clinical-safety: only fires for non-OTC inventory medicines during a
      // consultation — services/packages never auto-open the instructions modal.
      if (
        mode === 'consultation' &&
        catalog === 'inventory' &&
        p.is_otc === false &&
        inserted &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (inserted as any).item_id
      ) {
        onItemAdded?.(inserted as ConsultationItemRow);
      }

      resetPick();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Hook already toasts the stock sentinel — avoid double toast.
      if (!msg.includes('Not enough stock')) {
        toast.error('Failed to add: ' + msg);
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceOf = (row: any): number => {
    if (catalog === 'inventory') return Number(row.price_to_patient_max ?? 0);
    if (catalog === 'service') return Number(row.price_to_patient ?? 0);
    return Number(row.price ?? 0);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtitleOf = (row: any): string => {
    if (catalog === 'inventory') {
      return `Stock: ${row.stock ?? 0}${row.uom ? ` · ${row.uom}` : ''}`;
    }
    if (catalog === 'service') {
      return row.category ? String(row.category) : 'Service';
    }
    return 'Package';
  };

  return (
    <div className={cn(bento, 'p-4 space-y-3')}>
      <div className="flex items-center gap-2">
        <HeaderIcon className="h-4 w-4 text-primary" />
        <h2 className={bentoHeader}>{headerText}</h2>
      </div>

      <Tabs value={catalog} onValueChange={handleCatalogChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inventory" className="gap-1.5">
            <Pill className="h-3.5 w-3.5" /> Inventory
          </TabsTrigger>
          <TabsTrigger value="service" className="gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" /> Services
          </TabsTrigger>
          <TabsTrigger value="package" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Packages
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'consultation' && catalog === 'inventory' ? (
        <p className="text-xs text-muted-foreground">
          Note: Adding items to a doctor's consultation. Stock will be reserved immediately.
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_auto] gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">
            {catalog === 'inventory' ? 'Item' : catalog === 'service' ? 'Service' : 'Package'}
          </label>
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
                      : placeholderByCatalog[catalog]}
                  </span>
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={placeholderByCatalog[catalog]}
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {isLoading ? (
                    <CommandEmpty>Loading…</CommandEmpty>
                  ) : filtered.length === 0 ? (
                    <CommandEmpty>{emptyByCatalog[catalog]}</CommandEmpty>
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
                              {subtitleOf(i)}
                            </p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-slate-700">
                            RM {priceOf(i).toFixed(2)}
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
