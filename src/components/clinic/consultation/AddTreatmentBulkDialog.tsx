import { useState, useMemo } from 'react';
import { Search, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import { useServices } from '@/hooks/clinic/useServices';
import { usePackages } from '@/hooks/clinic/usePackages';

export interface SelectedDefaults {
  indication?: string | null;
  dosage_qty?: string | null;
  dosage_unit?: string | null;
  frequency?: string | null;
  instruction?: string | null;
  duration?: string | null;
  duration_unit?: string | null;
  precaution?: string | null;
}

interface SelectedItem {
  id: string;
  name: string;
  price: number;
  type: 'item' | 'service' | 'package';
  defaults?: SelectedDefaults;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (items: SelectedItem[]) => void;
}

interface CombinedRow {
  id: string;
  name: string;
  stock: number | null;
  uom: string;
  group: string;
  price: string;
  priceNum: number;
  type: 'item' | 'service' | 'package';
  defaults?: SelectedDefaults;
}

export function AddTreatmentBulkDialog({ open, onOpenChange, onInsert }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectedItem[]>([]);

  const { items: inventoryItems } = useInventoryItems();
  const { services } = useServices();
  const { packages } = usePackages();

  const allItems = useMemo<CombinedRow[]>(() => {
    const combined: CombinedRow[] = [];

    inventoryItems.forEach((i) =>
      combined.push({
        id: i.id,
        name: i.name,
        stock: i.stock,
        uom: i.groups || '—',
        group: i.category,
        price:
          i.price_to_patient_min === i.price_to_patient_max
            ? `RM ${Number(i.price_to_patient_min).toFixed(2)}`
            : `RM ${Number(i.price_to_patient_min).toFixed(2)} - ${Number(
                i.price_to_patient_max,
              ).toFixed(2)}`,
        priceNum: Number(i.price_to_patient_min),
        type: 'item',
      }),
    );

    services.forEach((s) =>
      combined.push({
        id: s.id,
        name: s.name,
        stock: null,
        uom: s.type,
        group: 'Service',
        price: `RM ${Number(s.price_to_patient).toFixed(2)}`,
        priceNum: Number(s.price_to_patient),
        type: 'service',
      }),
    );

    packages.forEach((p) =>
      combined.push({
        id: p.id,
        name: p.name,
        stock: p.stock,
        uom: 'Package',
        group: 'Package',
        price: `RM ${Number(p.price).toFixed(2)}`,
        priceNum: Number(p.price),
        type: 'package',
      }),
    );

    return combined;
  }, [inventoryItems, services, packages]);

  const filtered = useMemo(() => {
    if (!search) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (i) => i.name.toLowerCase().includes(q) || i.group.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  const toggleItem = (item: CombinedRow) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === item.id);
      if (exists) return prev.filter((s) => s.id !== item.id);
      return [...prev, { id: item.id, name: item.name, price: item.priceNum, type: item.type }];
    });
  };

  const toggleAll = () => {
    const allSelected = filtered.every((item) => selected.some((s) => s.id === item.id));
    if (allSelected) {
      const filteredIds = new Set(filtered.map((i) => i.id));
      setSelected((prev) => prev.filter((s) => !filteredIds.has(s.id)));
    } else {
      setSelected((prev) => {
        const existing = new Set(prev.map((s) => s.id));
        const newItems = filtered
          .filter((i) => !existing.has(i.id))
          .map((i) => ({ id: i.id, name: i.name, price: i.priceNum, type: i.type }));
        return [...prev, ...newItems];
      });
    }
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((item) => selected.some((s) => s.id === item.id));

  const removeSelected = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  };

  const handleInsert = () => {
    onInsert(selected);
    setSelected([]);
    setSearch('');
    onOpenChange(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelected([]);
      setSearch('');
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Add treatment in bulk</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 overflow-hidden">
          {/* Left - search & table */}
          <div className="flex-1 flex flex-col border-r px-6 pb-4">
            <p className="text-sm text-muted-foreground mb-3">
              Tick the checkbox to select item.
            </p>
            <div className="relative mb-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item name or group…"
                className="pr-9"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>NAME</TableHead>
                    <TableHead>STOCK</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>GROUP</TableHead>
                    <TableHead>PRICE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const isSelected = selected.some((s) => s.id === item.id);
                    return (
                      <TableRow
                        key={`${item.type}-${item.id}`}
                        className="cursor-pointer"
                        onClick={() => toggleItem(item)}
                      >
                        <TableCell>
                          <Checkbox checked={isSelected} />
                        </TableCell>
                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-sm">{item.stock ?? '—'}</TableCell>
                        <TableCell className="text-sm">{item.uom}</TableCell>
                        <TableCell className="text-sm">{item.group}</TableCell>
                        <TableCell className="text-sm">{item.price}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground py-8"
                      >
                        No items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Right - selected items */}
          <div className="w-72 flex flex-col px-4 pb-4">
            <div className="flex items-center justify-between mb-3 pt-1">
              <h3 className="text-sm font-semibold">Selected item</h3>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove all
                </button>
              )}
            </div>
            {selected.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  No items selected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Any selected items from your list will show up here.
                </p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {selected.map((s, idx) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"
                    >
                      <span className="truncate flex-1">
                        <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                        {s.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelected(s.id)}
                        className="ml-2 text-xs text-destructive hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end">
          <Button onClick={handleInsert} disabled={selected.length === 0}>
            Insert to treatment plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
