import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, signUpSchema, resetPasswordSchema, LoginFormData, SignUpFormData, ResetPasswordFormData } from '@/lib/validations';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Mail, Lock, User, ArrowLeft } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'reset';

export default function Auth() {
  const { language } = useLanguage();
  const { user, role, rolesLoading, signIn, signUp, resetPassword, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Role-aware redirect once session and role are both resolved
  useEffect(() => {
    if (!user || authLoading || rolesLoading) return;
    if (role === 'website_editor') {
      navigate('/editor', { replace: true });
    } else if (role === 'locum') {
      navigate('/clinic/queue', { replace: true });
    } else if (
      role === 'admin' ||
      role === 'special_admin' ||
      role === 'doctor_admin' ||
      role === 'operations' ||
      role === 'staff'
    ) {
      // Future: /clinic/dashboard. Today the queue is the unified landing.
      navigate('/clinic/queue', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [user, role, authLoading, rolesLoading, navigate]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', fullName: '' },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    const { error } = await signIn(data.email, data.password);
    setIsSubmitting(false);

    if (error) {
      let message = language === 'ms' 
        ? 'Ralat semasa log masuk. Sila cuba lagi.'
        : 'Error during login. Please try again.';
      
      if (error.message.includes('Invalid login credentials')) {
        message = language === 'ms'
          ? 'Email atau kata laluan tidak sah.'
          : 'Invalid email or password.';
      } else if (error.message.includes('Email not confirmed')) {
        message = language === 'ms'
          ? 'Sila sahkan email anda terlebih dahulu.'
          : 'Please confirm your email first.';
      }

      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Log masuk berjaya!' : 'Login successful!',
      });
      // Role-aware redirect handled by the effect above once role resolves.
    }
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsSubmitting(true);
    const { error } = await signUp(data.email, data.password, data.fullName);
    setIsSubmitting(false);

    if (error) {
      let message = language === 'ms'
        ? 'Ralat semasa pendaftaran. Sila cuba lagi.'
        : 'Error during registration. Please try again.';

      if (error.message.includes('already registered')) {
        message = language === 'ms'
          ? 'Email ini sudah didaftarkan.'
          : 'This email is already registered.';
      }

      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'ms' ? '📧 Sahkan Email Anda' : '📧 Verify Your Email',
        description: language === 'ms'
          ? 'Pendaftaran berjaya! Kami telah menghantar pautan pengesahan ke email anda. Sila klik pautan tersebut untuk mengaktifkan akaun anda.'
          : 'Registration successful! We have sent a verification link to your email. Please click the link to activate your account.',
        duration: 10000, // Show for 10 seconds
      });
      signUpForm.reset();
      setMode('login');
    }
  };

  const handleResetPassword = async (data: ResetPasswordFormData) => {
    setIsSubmitting(true);
    const { error } = await resetPassword(data.email);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms'
          ? 'Ralat semasa menghantar email reset.'
          : 'Error sending reset email.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: language === 'ms' ? 'Email Dihantar' : 'Email Sent',
        description: language === 'ms'
          ? 'Sila semak email anda untuk pautan reset kata laluan.'
          : 'Please check your email for password reset link.',
      });
      setMode('login');
    }
  };

  if (authLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-md">
            <Card className="border-border/50 shadow-card">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">
                  {mode === 'login' && (language === 'ms' ? 'Log Masuk' : 'Login')}
                  {mode === 'signup' && (language === 'ms' ? 'Daftar Akaun' : 'Sign Up')}
                  {mode === 'reset' && (language === 'ms' ? 'Reset Kata Laluan' : 'Reset Password')}
                </CardTitle>
                <CardDescription>
                  {mode === 'login' && (language === 'ms' 
                    ? 'Log masuk ke akaun anda untuk mengakses panel admin.'
                    : 'Login to your account to access the admin panel.')}
                  {mode === 'signup' && (language === 'ms'
                    ? 'Daftar akaun baru untuk mula mengurus klinik.'
                    : 'Create a new account to start managing the clinic.')}
                  {mode === 'reset' && (language === 'ms'
                    ? 'Masukkan email anda untuk menerima pautan reset.'
                    : 'Enter your email to receive a reset link.')}
                </CardDescription>
              </CardHeader>

              <CardContent>
                {mode === 'login' && (
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Email' : 'Email'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} type="email" placeholder="email@contoh.com" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Kata Laluan' : 'Password'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} type="password" placeholder="••••••" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {language === 'ms' ? 'Log Masuk' : 'Login'}
                      </Button>
                    </form>
                  </Form>
                )}

                {mode === 'signup' && (
                  <Form {...signUpForm}>
                    <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
                      <FormField
                        control={signUpForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Nama Penuh' : 'Full Name'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} placeholder="Ahmad bin Ali" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signUpForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Email' : 'Email'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} type="email" placeholder="email@contoh.com" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={signUpForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Kata Laluan' : 'Password'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} type="password" placeholder="••••••" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {language === 'ms' ? 'Daftar' : 'Sign Up'}
                      </Button>
                    </form>
                  </Form>
                )}

                {mode === 'reset' && (
                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit(handleResetPassword)} className="space-y-4">
                      <FormField
                        control={resetForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === 'ms' ? 'Email' : 'Email'}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input {...field} type="email" placeholder="email@contoh.com" className="pl-10" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {language === 'ms' ? 'Hantar Pautan Reset' : 'Send Reset Link'}
                      </Button>
                    </form>
                  </Form>
                )}

                <div className="mt-6 space-y-2 text-center text-sm">
                  {mode === 'login' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMode('reset')}
                        className="text-primary hover:underline"
                      >
                        {language === 'ms' ? 'Lupa kata laluan?' : 'Forgot password?'}
                      </button>
                      <p className="text-muted-foreground">
                        {language === 'ms' ? 'Belum ada akaun?' : "Don't have an account?"}{' '}
                        <button
                          type="button"
                          onClick={() => setMode('signup')}
                          className="text-primary hover:underline"
                        >
                          {language === 'ms' ? 'Daftar' : 'Sign up'}
                        </button>
                      </p>
                    </>
                  )}

                  {mode === 'signup' && (
                    <p className="text-muted-foreground">
                      {language === 'ms' ? 'Sudah ada akaun?' : 'Already have an account?'}{' '}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="text-primary hover:underline"
                      >
                        {language === 'ms' ? 'Log masuk' : 'Login'}
                      </button>
                    </p>
                  )}

                  {mode === 'reset' && (
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {language === 'ms' ? 'Kembali ke log masuk' : 'Back to login'}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
