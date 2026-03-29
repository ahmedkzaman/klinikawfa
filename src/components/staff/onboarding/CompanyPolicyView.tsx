import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CompanyPolicyContent } from './CompanyPolicyContent';

interface CompanyPolicyViewProps {
  userId: string;
  onComplete: () => void;
}

export function CompanyPolicyView({ userId, onComplete }: CompanyPolicyViewProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_onboarding' as any)
        .update({ company_policy_acknowledged: true, is_completed: true } as any)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Onboarding selesai! Selamat datang ke Klinik Awfa.');
      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Langkah 4: Polisi Syarikat — Baca & Akui</CardTitle>
        <p className="text-sm text-muted-foreground">Sila baca keseluruhan dokumen di bawah, kemudian sahkan di bahagian bawah.</p>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none dark:prose-invert">
        <CompanyPolicyContent />

        {/* Acknowledge */}
        <div className="mt-6 space-y-4 not-prose">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} />
            <span className="text-sm">Saya telah membaca dan memahami Polisi Syarikat ini. <span className="text-destructive">*</span></span>
          </label>
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={!agreed || saving}>
              {saving ? 'Menyimpan...' : 'Selesai Onboarding ✓'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
