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
import { useAddPackage, useUpdatePackage } from '@/hooks/clinic/usePackages';
import { toast } from 'sonner';

export interface PackageRow {
  id: string;
  name: string;
  cost: number;
  price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg: PackageRow | null;
}

interface FormState {
  name: string;
  cost: string;
  price: string;
}

const EMPTY: FormState = { name: '', cost: '0', price: '0' };

export function PackageDialog({ open, onOpenChange, pkg }: Props) {
  const addPackage = useAddPackage();
  const updatePackage = useUpdatePackage();
  const isEdit = !!pkg;
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (pkg) {
      setForm({
        name: pkg.name,
        cost: String(pkg.cost ?? 0),
        price: String(pkg.price ?? 0),
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, pkg]);

  const submitting = addPackage.isPending || updatePackage.isPending;

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
      if (isEdit && pkg) {
        await updatePackage.mutateAsync({ id: pkg.id, ...payload });
        toast.success('Package updated');
      } else {
        await addPackage.mutateAsync(payload);
        toast.success('Package added');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save package');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package' : 'Add Package'}</DialogTitle>
          <DialogDescription>
            Bundled offerings combining services and items at a fixed price.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Name</Label>
            <Input
              id="pkg-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Annual Wellness Package"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-cost">Cost (RM)</Label>
              <Input
                id="pkg-cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Price (RM)</Label>
              <Input
                id="pkg-price"
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
            {isEdit ? 'Save Changes' : 'Add Package'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
