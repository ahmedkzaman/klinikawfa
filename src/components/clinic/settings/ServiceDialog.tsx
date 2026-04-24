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
import { useAddService, useUpdateService } from '@/hooks/clinic/useServices';
import { toast } from 'sonner';

export interface ServiceRow {
  id: string;
  name: string;
  cost: number;
  price_to_patient: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ServiceRow | null;
}

interface FormState {
  name: string;
  cost: string;
  price: string;
}

const EMPTY: FormState = { name: '', cost: '0', price: '0' };

export function ServiceDialog({ open, onOpenChange, service }: Props) {
  const addService = useAddService();
  const updateService = useUpdateService();
  const isEdit = !!service;
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (service) {
      setForm({
        name: service.name,
        cost: String(service.cost ?? 0),
        price: String(service.price_to_patient ?? 0),
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, service]);

  const submitting = addService.isPending || updateService.isPending;

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = {
      name: form.name.trim(),
      cost: Number(form.cost) || 0,
      price: Number(form.price) || 0,
    };
    try {
      if (isEdit && service) {
        await updateService.mutateAsync({ id: service.id, ...payload });
        toast.success('Service updated');
      } else {
        await addService.mutateAsync(payload);
        toast.success('Service added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save service');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            Services such as procedures, consultations, or screenings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Name</Label>
            <Input
              id="svc-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Wound Dressing"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost">Cost (RM)</Label>
              <Input
                id="svc-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-price">Price (RM)</Label>
              <Input
                id="svc-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
