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
import { useAddService, useUpdateService } from '@/hooks/clinic/useServices';
import { toast } from 'sonner';

export interface ServiceRow {
  id: string;
  name: string;
  cost: number;
  price_to_patient: number;
  status?: 'active' | 'inactive' | string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceRow | null;
}

const moneyField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z
    .number({ invalid_type_error: 'Enter a valid amount' })
    .nonnegative('Must be 0 or more'),
);

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  cost: moneyField,
  price: moneyField,
  // Hidden in UI but preserved through edit so existing status survives.
  status: z.enum(['active', 'inactive']).optional(),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

const EMPTY: ServiceFormData = { name: '', cost: 0, price: 0, status: 'active' };

export function ServiceDialog({ open, onOpenChange, service }: Props) {
  const addService = useAddService();
  const updateService = useUpdateService();
  const isEdit = !!service;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    if (service) {
      reset({
        name: service.name,
        cost: Number(service.cost) || 0,
        price: Number(service.price_to_patient) || 0,
        status:
          service.status === 'inactive' ? 'inactive' : 'active',
      });
    } else {
      reset(EMPTY);
    }
  }, [open, service, reset]);

  const submitting = addService.isPending || updateService.isPending;

  const onSubmit = handleSubmit(async (data) => {
    try {
      if (isEdit && service) {
        await updateService.mutateAsync({ id: service.id, ...data });
        toast.success('Service updated');
      } else {
        await addService.mutateAsync(data);
        toast.success('Service added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save service');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            Services such as procedures, consultations, or screenings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Name</Label>
            <Input id="svc-name" placeholder="e.g. Wound Dressing" {...register('name')} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost">Cost (RM)</Label>
              <Input
                id="svc-cost"
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
              <Label htmlFor="svc-price">Price (RM)</Label>
              <Input
                id="svc-price"
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
              {isEdit ? 'Save Changes' : 'Add Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
