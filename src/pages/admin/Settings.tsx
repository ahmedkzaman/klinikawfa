import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, CreditCard, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';

export default function Settings() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [stripeKey, setStripeKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    fetchStripeKey();
  }, []);

  const fetchStripeKey = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'stripe_secret_key')
        .single();

      if (error) throw error;

      if (data?.value) {
        setStripeKey(data.value);
        setHasKey(data.value.length > 0);
      }
    } catch (error) {
      console.error('Error fetching Stripe key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveStripeKey = async () => {
    if (!stripeKey.trim()) {
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Sila masukkan kunci API Stripe' : 'Please enter a Stripe API key',
        variant: 'destructive',
      });
      return;
    }

    if (!stripeKey.startsWith('sk_')) {
      toast({
        title: language === 'ms' ? 'Kunci Tidak Sah' : 'Invalid Key',
        description: language === 'ms' ? 'Kunci rahsia Stripe harus bermula dengan "sk_"' : 'Stripe secret keys should start with "sk_"',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: stripeKey })
        .eq('key', 'stripe_secret_key');

      if (error) throw error;

      setHasKey(true);
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Kunci API Stripe telah disimpan' : 'Stripe API key has been saved',
      });
    } catch (error) {
      console.error('Error saving Stripe key:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal menyimpan kunci API Stripe' : 'Failed to save Stripe API key',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const clearStripeKey = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: '' })
        .eq('key', 'stripe_secret_key');

      if (error) throw error;

      setStripeKey('');
      setHasKey(false);
      toast({
        title: language === 'ms' ? 'Dibersihkan' : 'Cleared',
        description: language === 'ms' ? 'Kunci API Stripe telah dibuang' : 'Stripe API key has been removed',
      });
    } catch (error) {
      console.error('Error clearing Stripe key:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal mengosongkan kunci API Stripe' : 'Failed to clear Stripe API key',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 12) return key;
    return key.slice(0, 7) + '•'.repeat(key.length - 11) + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          {language === 'ms' ? 'Tetapan' : 'Settings'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'ms' ? 'Urus tetapan aplikasi dan integrasi' : 'Manage your application settings and integrations'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {language === 'ms' ? 'Integrasi Stripe' : 'Stripe Integration'}
          </CardTitle>
          <CardDescription>
            {language === 'ms' ? 'Konfigurasikan kunci API Stripe untuk pemprosesan pembayaran' : 'Configure your Stripe API key for payment processing'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === 'ms' ? 'Memuatkan tetapan...' : 'Loading settings...'}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-medium">{language === 'ms' ? 'Status:' : 'Status:'}</span>
                {hasKey ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {language === 'ms' ? 'Disambungkan' : 'Connected'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600">
                    <XCircle className="h-4 w-4" />
                    {language === 'ms' ? 'Belum dikonfigurasi' : 'Not configured'}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stripeKey">
                  {language === 'ms' ? 'Kunci Rahsia Stripe' : 'Stripe Secret Key'}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="stripeKey"
                      type={showKey ? 'text' : 'password'}
                      value={showKey ? stripeKey : maskKey(stripeKey)}
                      onChange={(e) => setStripeKey(e.target.value)}
                      placeholder="sk_live_..."
                      className="pr-10 font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {language === 'ms' 
                    ? 'Kunci rahsia Stripe anda bermula dengan "sk_live_" atau "sk_test_"' 
                    : 'Your Stripe secret key starts with "sk_live_" or "sk_test_"'}
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={saveStripeKey} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {language === 'ms' ? 'Simpan Kunci' : 'Save Key'}
                </Button>
                {hasKey && (
                  <Button
                    variant="outline"
                    onClick={clearStripeKey}
                    disabled={isSaving}
                  >
                    {language === 'ms' ? 'Kosongkan Kunci' : 'Clear Key'}
                  </Button>
                )}
              </div>

              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-medium text-amber-800 mb-1">
                  ⚠️ {language === 'ms' ? 'Notis Keselamatan' : 'Security Notice'}
                </h4>
                <p className="text-sm text-amber-700">
                  {language === 'ms' 
                    ? 'Kunci API anda disimpan dalam pangkalan data. Untuk keselamatan maksimum, pertimbangkan untuk menggunakan rahsia persekitaran melalui tetapan Cloud Lovable.' 
                    : 'Your API key is stored in the database. For maximum security, consider using environment secrets through Lovable\'s Cloud settings instead.'}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
