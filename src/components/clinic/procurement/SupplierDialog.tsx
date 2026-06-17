import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSuppliers, type Supplier } from '@/hooks/clinic/useSuppliers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}

export function SupplierDialog({ open, onOpenChange, supplier }: Props) {
  const { addSupplier, updateSupplier } = useSuppliers();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(supplier?.name ?? '');
      setContact(supplier?.contact_person ?? '');
      setPhone(supplier?.phone ?? '');
      setEmail(supplier?.email ?? '');
      setNotes(supplier?.notes ?? '');
      setActive((supplier?.status ?? 'active') === 'active');
    }
  }, [open, supplier]);

  const isEdit = !!supplier;

  const onSave = async () => {
    if (!name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    const payload = {
      name: name.trim(),
      contact_person: contact.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      status: active ? 'active' : 'inactive',
    };
    try {
      if (isEdit) {
        await updateSupplier.mutateAsync({ id: supplier!.id, ...payload });
        toast.success('Supplier updated');
      } else {
        await addSupplier.mutateAsync(payload);
        toast.success('Supplier added');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="sup-name">Name *</Label>
            <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-contact">Contact person</Label>
            <Input id="sup-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sup-notes">Notes</Label>
            <Textarea id="sup-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="sup-active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive suppliers are hidden from PO selection.</p>
            </div>
            <Switch id="sup-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={addSupplier.isPending || updateSupplier.isPending}>
            {isEdit ? 'Save changes' : 'Create supplier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
