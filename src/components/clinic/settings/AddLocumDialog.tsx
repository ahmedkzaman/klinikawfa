import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddLocumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLocumDialog({ open, onOpenChange }: AddLocumDialogProps) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error('Full name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success('Locum account created. Default password: test1234');
      qc.invalidateQueries({ queryKey: ['clinic_users'] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create locum');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Locum Doctor</DialogTitle>
          <DialogDescription>
            Creates a Locum account silently — your session stays active. Default
            password will be set to <code className="font-mono text-xs px-1 rounded bg-muted">test1234</code>.
            The locum should change it on first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="locum-name">Full Name *</Label>
            <Input
              id="locum-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Ahmad bin Ali"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locum-email">Email *</Label>
            <Input
              id="locum-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="locum@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locum-phone">Phone Number</Label>
            <Input
              id="locum-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+60 12 345 6789"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Locum
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
