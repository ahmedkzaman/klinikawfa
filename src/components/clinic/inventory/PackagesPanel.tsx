import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Boxes, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import {
  useClinicPackages,
  useClinicPackageItems,
  useUpsertClinicPackage,
  useDeleteClinicPackage,
  type ClinicPackageItemDraft,
} from '@/hooks/clinic/useClinicPackages';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function PackagesPanel() {
  const { data: packages = [], isLoading } = useClinicPackages();
  const { items: inventory } = useInventoryItems();
  const upsert = useUpsertClinicPackage();
  const del = useDeleteClinicPackage();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isNew = selectedId === '__new__';
  const editingId = isNew ? null : selectedId;

  const { data: existingItems = [] } = useClinicPackageItems(editingId ?? undefined);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [items, setItems] = useState<ClinicPackageItemDraft[]>([]);

  // Hydrate when selection changes
  useEffect(() => {
    if (isNew) {
      setName(''); setDescription(''); setTotalPrice(''); setItems([]);
      return;
    }
    if (!editingId) return;
    const pkg = packages.find((p) => p.id === editingId);
    if (pkg) {
      setName(pkg.name);
      setDescription(pkg.description ?? '');
      setTotalPrice(String(pkg.total_price ?? ''));
    }
  }, [editingId, isNew, packages]);

  useEffect(() => {
    if (editingId) {
      setItems(existingItems.map((it) => ({
        inventory_item_id: it.inventory_item_id,
        quantity: it.quantity,
      })));
    }
  }, [editingId, existingItems]);

  const activeInventory = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (inventory as any[]).filter((i) => i.status === 'active' && !i.archived_at),
    [inventory],
  );

  const addRow = () => setItems((prev) => [...prev, { inventory_item_id: '', quantity: 1 }]);
  const updateRow = (idx: number, patch: Partial<ClinicPackageItemDraft>) =>
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const onSave = async () => {
    if (!name.trim()) return toast.error('Package name required');
    try {
      const res = await upsert.mutateAsync({
        id: editingId,
        name: name.trim(),
        description: description.trim() || null,
        total_price: Number(totalPrice) || 0,
        items: items.filter((i) => i.inventory_item_id && i.quantity > 0),
      });
      toast.success('Package saved');
      setSelectedId(res.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!editingId) return;
    if (!confirm('Delete this package? Items will be removed.')) return;
    try {
      await del.mutateAsync(editingId);
      toast.success('Package deleted');
      setSelectedId(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[280px_1fr] min-h-[500px]">
          {/* Left: package list */}
          <div className="border-r border-slate-100 bg-slate-50/50">
            <div className="p-3 border-b border-slate-100">
              <Button
                size="sm"
                className="w-full"
                onClick={() => setSelectedId('__new__')}
              >
                <Plus className="h-4 w-4 mr-1" /> New Package
              </Button>
            </div>
            <ScrollArea className="h-[460px]">
              <div className="p-2 space-y-1">
                {isLoading ? (
                  <p className="text-xs text-slate-400 px-2 py-3">Loading…</p>
                ) : packages.length === 0 ? (
                  <p className="text-xs text-slate-400 px-2 py-3">No packages yet.</p>
                ) : (
                  packages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        'w-full text-left rounded-md px-3 py-2 text-sm transition-colors',
                        selectedId === p.id
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-100 text-slate-700',
                      )}
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className={cn(
                        'text-xs',
                        selectedId === p.id ? 'text-blue-100' : 'text-slate-400',
                      )}>
                        RM {Number(p.total_price).toFixed(2)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: builder */}
          <div className="p-6">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Boxes className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500 max-w-xs">
                  Select a package on the left or create a new one to start building.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Price (RM)</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={totalPrice}
                      onChange={(e) => setTotalPrice(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bundled Items</Label>
                    <Button size="sm" variant="outline" onClick={addRow}>
                      <Plus className="h-4 w-4 mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Inventory Item</TableHead>
                          <TableHead className="w-32">Quantity</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">
                              No items. Click "Add Item".
                            </TableCell>
                          </TableRow>
                        ) : items.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Select
                                value={row.inventory_item_id || undefined}
                                onValueChange={(v) => updateRow(idx, { inventory_item_id: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeInventory.map((it) => (
                                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                value={row.quantity}
                                onChange={(e) => updateRow(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeRow(idx)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  {editingId ? (
                    <Button variant="outline" onClick={onDelete} disabled={del.isPending}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  ) : <div />}
                  <Button onClick={onSave} disabled={upsert.isPending}>
                    {upsert.isPending ? 'Saving…' : 'Save Package'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
