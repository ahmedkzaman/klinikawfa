import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAddInventoryItem,
  useUpdateInventoryItem,
} from '@/hooks/clinic/useInventoryItems';
import { toast } from 'sonner';

export interface InventoryItemRow {
  id: string;
  name: string;
  cost_price: number;
  price_to_patient_max: number;
  stock: number;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItemRow | null;
}

interface FormState {
  name: string;
  cost_price: string;
  selling_price: string;
  current_stock: string;
  status: 'active' | 'inactive';
}

const EMPTY: FormState = {
  name: '',
  cost_price: '0',
  selling_price: '0',
  current_stock: '0',
  status: 'active',
};

export function InventoryItemDialog({ open, onOpenChange, item }: Props) {
  const addItem = useAddInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        name: item.name,
        cost_price: String(item.cost_price ?? 0),
        selling_price: String(item.price_to_patient_max ?? 0),
        current_stock: String(item.stock ?? 0),
        status: (item.status as 'active' | 'inactive') ?? 'active',
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, item]);

  const submitting = addItem.isPending || updateItem.isPending;

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      cost_price: Number(form.cost_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      current_stock: parseInt(form.current_stock, 10) || 0,
      status: form.status,
    };
    try {
      if (isEdit && item) {
        await updateItem.mutateAsync({ id: item.id, ...payload });
        toast.success('Item updated');
      } else {
        await addItem.mutateAsync(payload);
        toast.success('Item added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save item');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>
            Manage inventory items used in consultations and dispensing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Paracetamol 500mg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Cost Price (RM)</Label>
              <Input
                id="item-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost_price}
                onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-selling">Selling Price (RM)</Label>
              <Input
                id="item-selling"
                type="number"
                step="0.01"
                min="0"
                value={form.selling_price}
                onChange={(e) => setForm((f) => ({ ...f, selling_price: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-stock">Current Stock</Label>
              <Input
                id="item-stock"
                type="number"
                step="1"
                min="0"
                value={form.current_stock}
                onChange={(e) => setForm((f) => ({ ...f, current_stock: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, status: v as 'active' | 'inactive' }))
                }
              >
                <SelectTrigger id="item-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
