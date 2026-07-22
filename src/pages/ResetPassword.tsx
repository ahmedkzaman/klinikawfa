import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Lock } from 'lucide-react';
import { resolveRecoverySessionState } from '@/lib/recovery-session';

const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, { message: 'Kata laluan minimum 6 aksara / Password min 6 characters' })
      .max(100, { message: 'Kata laluan terlalu panjang / Password too long' }),
    confirmPassword: z.string().min(1, { message: 'Sila sahkan kata laluan / Please confirm password' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Kata laluan tidak sepadan / Passwords do not match',
    path: ['confirmPassword'],
  });

type NewPasswordFormData = z.infer<typeof newPasswordSchema>;

export default function ResetPassword() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(() =>
    resolveRecoverySessionState({ session: null, hash: window.location.hash }),
  );

  const form = useForm<NewPasswordFormData>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  // Detect Supabase recovery session from email link.
  // Supabase places tokens in the URL hash and triggers PASSWORD_RECOVERY event.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session && window.location.hash.includes('type=recovery'))) {
        setIsValidSession(true);
      }
    });

    // Fallback check: if a session already exists from the recovery link
    supabase.auth.getSession().then(({ data: { session } }) => {
      const hash = window.location.hash;
      if (session && (hash.includes('type=recovery') || hash.includes('access_token'))) {
        setIsValidSession(true);
      } else if (!session) {
        setIsValidSession(resolveRecoverySessionState({ session, hash }));
      } else {
        // user already signed in with a normal session — still allow them to update password
        setIsValidSession(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (data: NewPasswordFormData) => {
    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: data.password });
    setIsSubmitting(false);

    if (error) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: language === 'ms' ? 'Berjaya!' : 'Success!',
      description:
        language === 'ms'
          ? 'Kata laluan anda telah dikemas kini. Sila log masuk semula.'
          : 'Your password has been updated. Please log in again.',
    });

    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <MainLayout>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">
              {language === 'ms' ? 'Tetapkan Semula Kata Laluan' : 'Reset Password'}
            </CardTitle>
            <CardDescription>
              {language === 'ms'
                ? 'Masukkan kata laluan baharu anda di bawah.'
                : 'Enter your new password below.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isValidSession === false ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {language === 'ms'
                    ? 'Pautan tetapan semula tidak sah atau telah tamat tempoh. Sila minta pautan baharu.'
                    : 'This reset link is invalid or has expired. Please request a new one.'}
                </p>
                <Button className="w-full" onClick={() => navigate('/auth')}>
                  {language === 'ms' ? 'Kembali ke Log Masuk' : 'Back to Login'}
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {language === 'ms' ? 'Kata Laluan Baharu' : 'New Password'}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input type="password" className="pl-10" placeholder="••••••••" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {language === 'ms' ? 'Sahkan Kata Laluan' : 'Confirm Password'}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input type="password" className="pl-10" placeholder="••••••••" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isSubmitting || isValidSession === null}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {language === 'ms' ? 'Kemas Kini Kata Laluan' : 'Update Password'}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
