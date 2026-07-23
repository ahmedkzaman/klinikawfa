import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Lock, User, Phone, BadgeCheck, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function LocumRegister() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [mmcNumber, setMmcNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!mmcNumber.trim()) {
      toast.error('MMC Registration Number is required');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            requested_role: 'locum',
            full_name: fullName.trim(),
            phone: phone.trim(),
            mmc_number: mmcNumber.trim(),
          },
        },
      });
      if (error) throw error;
      setSuccess(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      const msg = err?.message?.includes('registered')
        ? 'This email is already registered.'
        : err?.message || 'Registration failed. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-md">
            <Card className="border-border/50 shadow-card">
              <CardHeader className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <BadgeCheck className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Locum Doctor Registration</CardTitle>
                <CardDescription>
                  Apply to join Klinik Awfa as a Locum. Our Medical Director will
                  review your MMC credentials before granting clinic access.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {success ? (
                  <div className="space-y-4 text-center">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
                    <h3 className="text-lg font-semibold">Registration Submitted</h3>
                    <p className="text-sm text-muted-foreground">
                      Please check your email to verify your account. Our Medical
                      Director will then review your MMC credentials and approve
                      your clinic access. You will be notified once approved.
                    </p>
                    <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Full Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="reg-name"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Dr. Ahmad bin Ali"
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reg-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="reg-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="doctor@example.com"
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="reg-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="pl-10"
                          required
                          minLength={8}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reg-phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="reg-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+60 12 345 6789"
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reg-mmc">MMC Registration Number</Label>
                      <div className="relative">
                        <BadgeCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="reg-mmc"
                          value={mmcNumber}
                          onChange={(e) => setMmcNumber(e.target.value)}
                          placeholder="e.g. 12345"
                          className="pl-10"
                          required
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your Malaysian Medical Council registration number. Required
                        for credential verification.
                      </p>
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Submit Application
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{' '}
                      <Link to="/auth" className="text-primary hover:underline">
                        Login
                      </Link>
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}