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
import { useAddPackage, useUpdatePackage } from '@/hooks/clinic/usePackages';
import { toast } from 'sonner';

export interface PackageRow {
  id: string;
  name: string;
  cost: number;
  price: number;
  status?: 'active' | 'inactive' | string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: PackageRow | null;
}

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const packageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: moneyField,
  price: moneyField,
  status: z.enum(['active', 'inactive']).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;

const EMPTY: PackageFormData = { name: '', cost: 0, price: 0, status: 'active' };

export function PackageDialog({ open, onOpenChange, pkg }: Props) {
  const addPackage = useAddPackage();
  const updatePackage = useUpdatePackage();
  const isEdit = !!pkg;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (pkg) {
      reset({
        name: pkg.name,
        cost: Number(pkg.cost) || 0,
        price: Number(pkg.price) || 0,
        status: pkg.status === 'inactive' ? 'inactive' : 'active',
      });
    } else {
      reset(EMPTY);
    }
  }, [open, pkg, reset]);

  const submitting = addPackage.isPending || updatePackage.isPending;

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEdit && pkg) {
        await updatePackage.mutateAsync({ id: pkg.id, ...data });
        toast.success('Package updated');
      } else {
        await addPackage.mutateAsync(data);
        toast.success('Package added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save package');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            Bundled offerings combining services and items at a fixed price.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Name</Label>
            <Input
              id="pkg-name"
              placeholder="e.g. Annual Wellness Package"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-cost">Cost (RM)</Label>
              <Input
                id="pkg-cost"
                type="number"
                step="0.01"
                min="0"
                {...register('cost')}
              />
              {errors.cost && (
                <p className="text-sm text-destructive">{errors.cost.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Price (RM)</Label>
              <Input
                id="pkg-price"
                type="number"
                step="0.01"
                min="0"
                {...register('price')}
              />
              {errors.price && (
                <p className="text-sm text-destructive">{errors.price.message}</p>
              )}
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
              {isEdit ? 'Save Changes' : 'Add Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
