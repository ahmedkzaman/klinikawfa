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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateDoctor, useUpdateDoctor } from '@/hooks/clinic/useDoctors';
import type { ClinicUserRow } from '@/hooks/clinic/useClinicUsers';
import { toast } from 'sonner';

interface DoctorProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: ClinicUserRow | null;
}

interface FormState {
  name: string;
  status: 'active' | 'inactive';
  on_duty: boolean;
}

export function DoctorProfileDialog({ open, onOpenChange, user }: DoctorProfileDialogProps) {
  const createDoctor = useCreateDoctor();
  const updateDoctor = useUpdateDoctor();

  const isEdit = !!user?.doctor;

  const [form, setForm] = useState<FormState>({
    name: '',
    status: 'active',
    on_duty: false,
  });

  // Reset form whenever the target user (or open state) changes
  useEffect(() => {
    if (!open || !user) return;
    if (user.doctor) {
      setForm({
        name: user.doctor.name,
        status: user.doctor.status,
        on_duty: user.doctor.on_duty,
      });
    } else {
      setForm({
        name: user.full_name ? `Dr. ${user.full_name}` : '',
        status: 'active',
        on_duty: false,
      });
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      if (isEdit && user.doctor) {
        await updateDoctor.mutateAsync({
          id: user.doctor.id,
          name: form.name.trim(),
          status: form.status,
          on_duty: form.on_duty,
        });
        toast.success('Doctor profile updated');
      } else {
        await createDoctor.mutateAsync({
          user_id: user.id,
          name: form.name.trim(),
          status: form.status,
          on_duty: form.on_duty,
        });
        toast.success('Doctor profile created');
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save doctor profile');
    }
  };

  const isPending = createDoctor.isPending || updateDoctor.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Doctor Profile' : 'Create Doctor Profile'}
          </DialogTitle>
          <DialogDescription>
            {user
              ? `Linked to ${user.full_name || user.email}`
              : 'Manage the doctor record for this user.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doctor-name">Name</Label>
            <Input
              id="doctor-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Dr. John"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doctor-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'active' | 'inactive' }))}
            >
              <SelectTrigger id="doctor-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="doctor-on-duty" className="text-sm font-medium">
                On Duty
              </Label>
              <p className="text-xs text-muted-foreground">
                Show this doctor as available in the queue.
              </p>
            </div>
            <Switch
              id="doctor-on-duty"
              checked={form.on_duty}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, on_duty: checked }))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Profile'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
