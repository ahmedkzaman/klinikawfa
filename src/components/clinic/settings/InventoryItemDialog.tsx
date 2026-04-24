import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

// Coerce empty string -> undefined so blank fields fail validation instead of
// silently becoming 0.
const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const intField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid number' })
    .int('Must be a whole number')
    .nonnegative('Must be 0 or more'),
);

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost_price: moneyField,
  selling_price: moneyField,
  current_stock: intField,
  status: z.enum(['active', 'inactive']),
});

type ItemFormData = z.infer<typeof itemSchema>;

const EMPTY_VALUES: ItemFormData = {
  name: '',
  cost_price: 0,
  selling_price: 0,
  current_stock: 0,
  status: 'active',
};

export function InventoryItemDialog({ open, onOpenChange, item }: Props) {
  const addItem = useAddInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const isEdit = !!item;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ItemFormData>({
    resolver: zodResolver(itemSchema),
    defaultValues: EMPTY_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (item) {
      reset({
        name: item.name,
        cost_price: Number(item.cost_price) || 0,
        selling_price: Number(item.price_to_patient_max) || 0,
        current_stock: Number(item.stock) || 0,
        status: (item.status as 'active' | 'inactive') ?? 'active',
      });
    } else {
      reset(EMPTY_VALUES);
    }
  }, [open, item, reset]);

  const submitting = addItem.isPending || updateItem.isPending;
  const status = watch('status');

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = {
        name: data.name,
        cost_price: data.cost_price,
        selling_price: data.selling_price,
        current_stock: data.current_stock,
        status: data.status,
      };
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
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>
            Manage inventory items used in consultations and dispensing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" placeholder="e.g. Paracetamol 500mg" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Cost Price (RM)</Label>
              <Input
                id="item-cost"
                type="number"
                step="0.01"
                min="0"
                {...register('cost_price')}
              />
              {errors.cost_price && (
                <p className="text-sm text-destructive">{errors.cost_price.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-selling">Selling Price (RM)</Label>
              <Input
                id="item-selling"
                type="number"
                step="0.01"
                min="0"
                {...register('selling_price')}
              />
              {errors.selling_price && (
                <p className="text-sm text-destructive">{errors.selling_price.message}</p>
              )}
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
                {...register('current_stock')}
              />
              {errors.current_stock && (
                <p className="text-sm text-destructive">{errors.current_stock.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue('status', v as 'active' | 'inactive')}
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
