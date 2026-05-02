import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import { usePurchaseOrderItems } from '@/hooks/clinic/usePurchaseOrderItems';
import type { PurchaseOrderItemRow } from '@/hooks/clinic/usePurchaseOrders';
import { toast } from 'sonner';

interface Props {
  poId: string;
  items: PurchaseOrderItemRow[];
  readOnly?: boolean;
}

export function POLineItemsTable({ poId, items, readOnly }: Props) {
  const { items: inventory } = useInventoryItems();
  const { addLine, updateLine, removeLine } = usePurchaseOrderItems(poId);
  const [newItemId, setNewItemId] = useState<string>('');

  const activeInventory = (inventory ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (i: any) => i.status === 'active' && !i.archived_at
  );

  const onAddLine = async () => {
    if (!newItemId) {
      toast.error('Select an item to add');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = activeInventory.find((i: any) => i.id === newItemId);
    try {
      await addLine.mutateAsync({
        inventory_item_id: newItemId,
        order_qty: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unit_cost: Number((inv as any)?.cost_price ?? 0),
      });
      setNewItemId('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit Cost (RM)</TableHead>
              <TableHead className="w-32 text-right">Total (RM)</TableHead>
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={readOnly ? 4 : 5} className="text-center text-sm text-muted-foreground py-6">
                  No items yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.inventory_item?.name ?? '—'}</TableCell>
                <TableCell>
                  {readOnly ? (
                    line.order_qty
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      defaultValue={line.order_qty}
                      onBlur={(e) => {
                        const v = Math.max(1, Number(e.target.value) || 1);
                        if (v !== line.order_qty) {
                          updateLine.mutate({ id: line.id, order_qty: v });
                        }
                      }}
                      className="h-8"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readOnly ? (
                    Number(line.unit_cost).toFixed(2)
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={line.unit_cost}
                      onBlur={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        if (v !== Number(line.unit_cost)) {
                          updateLine.mutate({ id: line.id, unit_cost: v });
                        }
                      }}
                      className="h-8"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {Number(line.total_price).toFixed(2)}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeLine.mutate(line.id)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Select value={newItemId} onValueChange={setNewItemId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select inventory item to add..." />
            </SelectTrigger>
            <SelectContent>
              {activeInventory.map((i) => (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <SelectItem key={(i as any).id} value={(i as any).id}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(i as any).name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={onAddLine} disabled={addLine.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add Line
          </Button>
        </div>
      )}
    </div>
  );
}
