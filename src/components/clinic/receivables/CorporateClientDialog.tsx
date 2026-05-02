import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  useCreateCorporateClient,
  useUpdateCorporateClient,
  type CorporateClient,
} from '@/hooks/clinic/useCorporateClients';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: CorporateClient | null;
}

const EMPTY = {
  name: '',
  address: '',
  contact_person: '',
  phone: '',
  email: '',
  status: 'active',
};

export function CorporateClientDialog({ open, onOpenChange, client }: Props) {
  const create = useCreateCorporateClient();
  const update = useUpdateCorporateClient();
  const isEdit = !!client?.id;

  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      setForm(client ? {
        name: client.name ?? '',
        address: client.address ?? '',
        contact_person: client.contact_person ?? '',
        phone: client.phone ?? '',
        email: client.email ?? '',
        status: client.status ?? 'active',
      } : EMPTY);
    }
  }, [open, client]);

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Client name required');
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        status: form.status,
      };
      if (isEdit && client) {
        await update.mutateAsync({ id: client.id, patch: payload });
        toast.success('Client updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Client added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (pending) return; onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Corporate Client' : 'Add Corporate Client'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ACME Sdn Bhd" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea rows={2} value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
