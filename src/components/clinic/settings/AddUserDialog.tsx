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
import { generateTemporaryPassword } from '@/lib/security';
import { toast } from 'sonner';

export type CreatableUserRole = 'locum' | 'resident_doctor' | 'website_editor';

const ROLE_COPY: Record<
  CreatableUserRole,
  { title: string; description: string; namePlaceholder: string; emailPlaceholder: string; cta: string; success: string }
> = {
  locum: {
    title: 'Add Locum Doctor',
    description: 'Creates a Locum account silently — your session stays active.',
    namePlaceholder: 'Dr. Ahmad bin Ali',
    emailPlaceholder: 'locum@example.com',
    cta: 'Create Locum',
    success: 'Locum account created with a generated temporary password.',
  },
  resident_doctor: {
    title: 'Add Resident Doctor',
    description:
      'Creates a Resident Doctor employee account. They will be required to complete HR onboarding on first login.',
    namePlaceholder: 'Dr. Siti binti Rahman',
    emailPlaceholder: 'doctor@klinikawfa.com',
    cta: 'Create Resident Doctor',
    success: 'Resident Doctor account created with a generated temporary password.',
  },
  website_editor: {
    title: 'Add Website Editor',
    description: 'Creates a Website Editor account silently â€” your session stays active.',
    namePlaceholder: 'Website Editor',
    emailPlaceholder: 'editor@klinikawfa.com',
    cta: 'Create Website Editor',
    success: 'Website Editor account created with a generated temporary password.',
  },
};

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: CreatableUserRole;
}

type FunctionErrorBody = { error?: unknown };

export function AddUserDialog({ open, onOpenChange, role }: AddUserDialogProps) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const copy = ROLE_COPY[role];

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
      const temporaryPassword = generateTemporaryPassword();
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          password: temporaryPassword,
          role,
        },
      });
      if (error) throw error;
      const functionBody = data as FunctionErrorBody | null;
      if (functionBody?.error) throw new Error(String(functionBody.error));

      toast.success(`${copy.success} Temporary password: ${temporaryPassword}`);
      qc.invalidateQueries({ queryKey: ['clinic_users'] });
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.description} A unique temporary password will be generated and shown once after creation.
            User should change it on first login.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-name">Full Name *</Label>
            <Input
              id="user-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={copy.namePlaceholder}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-email">Email *</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.emailPlaceholder}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-phone">Phone Number</Label>
            <Input
              id="user-phone"
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
              {copy.cta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
