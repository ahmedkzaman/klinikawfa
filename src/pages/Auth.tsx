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
import { Loader2, Mail, Lock, User, ArrowLeft, Eye, EyeOff } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'reset';

type LoginAuthError = Error & {
  code?: string;
  status?: number;
};

export default function Auth() {
  const { language } = useLanguage();
  const { user, role, rolesLoading, signIn, signUp, resetPassword, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

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

  const changeMode = (nextMode: AuthMode) => {
    if (mode === 'login' && nextMode !== 'login') {
      loginForm.resetField('password', { defaultValue: '' });
      setShowLoginPassword(false);
    }
    setMode(nextMode);
  };

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        const authError = error as LoginAuthError;
        const isInvalidCredentials =
          authError.code === 'invalid_credentials' ||
          authError.message.includes('Invalid login credentials');

        let message = language === 'ms'
          ? `Log masuk gagal${authError.code ? ` (${authError.code})` : ''}. Sila cuba lagi.`
          : `Login failed${authError.code ? ` (${authError.code})` : ''}. Please try again.`;

        if (isInvalidCredentials) {
          loginForm.resetField('password', { defaultValue: '' });
          setShowLoginPassword(false);
          message = language === 'ms'
            ? 'Email atau kata laluan tidak sah. Sila taip semula kata laluan.'
            : 'Invalid email or password. Please type the password again.';
        } else if (
          authError.code === 'email_not_confirmed' ||
          authError.message.includes('Email not confirmed')
        ) {
          message = language === 'ms'
            ? 'Sila sahkan email anda terlebih dahulu.'
            : 'Please confirm your email first.';
        }

        toast({
          title: language === 'ms' ? 'Ralat' : 'Error',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Log masuk berjaya!' : 'Login successful!',
      });
      // Role-aware redirect handled by the effect above once role resolves.
    } catch (error) {
      const authError = error as Partial<LoginAuthError>;
      const diagnostic = authError.code || (authError.status ? `HTTP ${authError.status}` : null);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms'
          ? `Log masuk gagal${diagnostic ? ` (${diagnostic})` : ''}. Sila periksa sambungan dan cuba lagi.`
          : `Login failed${diagnostic ? ` (${diagnostic})` : ''}. Please check your connection and try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
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
      changeMode('login');
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
      changeMode('login');
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
      <section className="bg-muted/30 py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-md">
            <Card className="border-border/70 shadow-card">
              <CardHeader className="space-y-3 text-center">
                <CardTitle className="font-display text-2xl">
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
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input
                                  {...field}
                                  type="email"
                                  autoComplete="username"
                                  autoCapitalize="none"
                                  spellCheck={false}
                                  placeholder="email@contoh.com"
                                  className="min-h-11 pl-10"
                                />
                              </FormControl>
                            </div>
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
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input
                                  {...field}
                                  type={showLoginPassword ? 'text' : 'password'}
                                  autoComplete="current-password"
                                  placeholder="••••••"
                                  className="min-h-11 pl-10 pr-12"
                                />
                              </FormControl>
                              <button
                                type="button"
                                onClick={() => setShowLoginPassword((visible) => !visible)}
                                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label={showLoginPassword
                                  ? (language === 'ms' ? 'Sembunyikan kata laluan' : 'Hide password')
                                  : (language === 'ms' ? 'Tunjukkan kata laluan' : 'Show password')}
                              >
                                {showLoginPassword
                                  ? <EyeOff className="h-4 w-4" />
                                  : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full min-h-11" disabled={isSubmitting}>
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
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input {...field} placeholder="Ahmad bin Ali" className="min-h-11 pl-10" />
                              </FormControl>
                            </div>
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
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input {...field} type="email" placeholder="email@contoh.com" className="min-h-11 pl-10" />
                              </FormControl>
                            </div>
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
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input {...field} type="password" placeholder="••••••" className="min-h-11 pl-10" />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full min-h-11" disabled={isSubmitting}>
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
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                              <FormControl>
                                <Input {...field} type="email" placeholder="email@contoh.com" className="min-h-11 pl-10" />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" className="w-full min-h-11" disabled={isSubmitting}>
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
                        onClick={() => changeMode('reset')}
                        className="min-h-11 px-2 text-primary hover:underline"
                      >
                        {language === 'ms' ? 'Lupa kata laluan?' : 'Forgot password?'}
                      </button>
                      <p className="text-muted-foreground">
                        {language === 'ms' ? 'Belum ada akaun?' : "Don't have an account?"}{' '}
                        <button
                          type="button"
                          onClick={() => changeMode('signup')}
                          className="min-h-11 px-2 text-primary hover:underline"
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
                        onClick={() => changeMode('login')}
                        className="min-h-11 px-2 text-primary hover:underline"
                      >
                        {language === 'ms' ? 'Log masuk' : 'Login'}
                      </button>
                    </p>
                  )}

                  {mode === 'reset' && (
                    <button
                      type="button"
                      onClick={() => changeMode('login')}
                      className="inline-flex min-h-11 items-center gap-1 px-2 text-primary hover:underline"
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
