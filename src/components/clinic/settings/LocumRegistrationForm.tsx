import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { generateTemporaryPassword } from '@/lib/security';
import { toast } from 'sonner';

interface LocumRegistrationFormProps {
  /** Called after a successful create so callers can close dialogs etc. */
  onSuccess?: () => void;
  /** Footer slot rendered inside the <form>, e.g. Dialog Cancel/Submit row. */
  footer?: (state: { submitting: boolean }) => React.ReactNode;
  /** Render the default standalone submit button when no footer is provided. */
  showDefaultSubmit?: boolean;
}

type FunctionErrorBody = { error?: unknown };

/**
 * Shared form for creating a Locum doctor account. Used by both the
 * front-desk standalone page and the admin dialog. Password input has
 * a visibility toggle to prevent typos during fast desk onboarding.
 */
export function LocumRegistrationForm({
  onSuccess,
  footer,
  showDefaultSubmit = true,
}: LocumRegistrationFormProps) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword(generateTemporaryPassword());
    setShowPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error('Full name and email are required');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          password,
          role: 'locum',
        },
      });
      if (error) throw error;
      const functionBody = data as FunctionErrorBody | null;
      if (functionBody?.error) throw new Error(String(functionBody.error));

      toast.success(`Locum account created for ${email.trim()}`);
      qc.invalidateQueries({ queryKey: ['clinic_users'] });
      reset();
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create locum account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
      <div className="space-y-2">
        <Label htmlFor="locum-password">Initial Password *</Label>
        <div className="relative">
          <Input
            id="locum-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this with the locum. They should change it on first login.
        </p>
      </div>

      {footer ? (
        footer({ submitting })
      ) : showDefaultSubmit ? (
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create Locum Account
        </Button>
      ) : null}
    </form>
  );
}
