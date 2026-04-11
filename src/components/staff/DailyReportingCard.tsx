import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Camera, Image, MessageSquare, CheckCircle, Clock, Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DailyReport {
  id?: string;
  briefing_selfie_url: string | null;
  stock_photo_1_url: string | null;
  stock_photo_2_url: string | null;
  whatsapp_blast_count: number;
}

export default function DailyReportingCard() {
  const { user } = useAuth();
  const [report, setReport] = useState<DailyReport>({
    briefing_selfie_url: null,
    stock_photo_1_url: null,
    stock_photo_2_url: null,
    whatsapp_blast_count: 0,
  });
  const [blastTarget, setBlastTarget] = useState(5);
  const [blastInput, setBlastInput] = useState('');
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const selfieRef = useRef<HTMLInputElement>(null);
  const stock1Ref = useRef<HTMLInputElement>(null);
  const stock2Ref = useRef<HTMLInputElement>(null);

  const now = new Date();
  const currentHour = now.getHours();
  const isSelfieWindow = currentHour >= 8 && currentHour < 9;
  const isStockWindow = currentHour >= 8 && currentHour < 10;
  const todayStr = format(now, 'yyyy-MM-dd');

  useEffect(() => {
    if (user) {
      fetchReport();
      fetchBlastTarget();
    }
  }, [user]);

  const fetchReport = async () => {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('user_id', user!.id)
      .eq('report_date', todayStr)
      .maybeSingle();
    if (data) {
      setReport({
        id: data.id,
        briefing_selfie_url: data.briefing_selfie_url,
        stock_photo_1_url: data.stock_photo_1_url,
        stock_photo_2_url: data.stock_photo_2_url,
        whatsapp_blast_count: data.whatsapp_blast_count || 0,
      });
      setBlastInput(String(data.whatsapp_blast_count || 0));
    }
    setLoading(false);
  };

  const fetchBlastTarget = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'daily_whatsapp_blast_target')
      .maybeSingle();
    if (data) setBlastTarget(parseInt(data.value) || 5);
  };

  const uploadPhoto = async (file: File, field: 'briefing_selfie_url' | 'stock_photo_1_url' | 'stock_photo_2_url') => {
    if (!user) return;
    const fieldKey = field.replace('_url', '');
    setUploading(prev => ({ ...prev, [field]: true }));

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${todayStr}/${fieldKey}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('daily-reports')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('daily-reports')
        .getPublicUrl(path);

      const url = urlData.publicUrl;

      // Upsert the report
      const upsertData: any = {
        user_id: user.id,
        report_date: todayStr,
        [field]: url,
      };

      if (report.id) {
        await supabase.from('daily_reports').update({ [field]: url }).eq('id', report.id);
      } else {
        const { data: inserted } = await supabase.from('daily_reports').insert(upsertData).select().single();
        if (inserted) setReport(prev => ({ ...prev, id: inserted.id }));
      }

      setReport(prev => ({ ...prev, [field]: url }));
      toast.success('Photo uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(prev => ({ ...prev, [field]: false }));
    }
  };

  const saveBlastCount = async () => {
    if (!user) return;
    const count = parseInt(blastInput) || 0;

    try {
      if (report.id) {
        await supabase.from('daily_reports').update({ whatsapp_blast_count: count }).eq('id', report.id);
      } else {
        const { data: inserted } = await supabase.from('daily_reports').insert({
          user_id: user.id,
          report_date: todayStr,
          whatsapp_blast_count: count,
        }).select().single();
        if (inserted) setReport(prev => ({ ...prev, id: inserted.id }));
      }
      setReport(prev => ({ ...prev, whatsapp_blast_count: count }));
      toast.success('Blast count saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    }
  };

  const StatusIcon = ({ done }: { done: boolean }) =>
    done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-muted-foreground" />;

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📋 Daily Reporting — {format(now, 'dd MMM yyyy')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Morning Briefing Selfie */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3 min-w-0">
            <Camera className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Morning Briefing Selfie</p>
              <p className="text-xs text-muted-foreground">Upload window: 8:00 – 9:00 AM</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusIcon done={!!report.briefing_selfie_url} />
            {report.briefing_selfie_url ? (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Done</Badge>
            ) : (
              <>
                <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'briefing_selfie_url')} />
                <Button size="sm" variant="outline" disabled={!isSelfieWindow || uploading.briefing_selfie_url}
                  onClick={() => selfieRef.current?.click()}>
                  {uploading.briefing_selfie_url ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Upload
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Medication Stock Photos */}
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            <Image className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">Medication Stock Photos</p>
              <p className="text-xs text-muted-foreground">Upload window: 8:00 – 10:00 AM • Must include timestamp & date stamp</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['stock_photo_1_url', 'stock_photo_2_url'] as const).map((field, i) => (
              <div key={field} className="flex items-center justify-between gap-2 p-2 rounded border bg-background">
                <span className="text-xs font-medium">Photo {i + 1}</span>
                <div className="flex items-center gap-1.5">
                  <StatusIcon done={!!report[field]} />
                  {report[field] ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">Done</Badge>
                  ) : (
                    <>
                      <input ref={i === 0 ? stock1Ref : stock2Ref} type="file" accept="image/*" className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], field)} />
                      <Button size="sm" variant="outline" disabled={!isStockWindow || uploading[field]}
                        onClick={() => (i === 0 ? stock1Ref : stock2Ref).current?.click()}>
                        {uploading[field] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                        Upload
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp Blast Count */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3 min-w-0">
            <MessageSquare className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">WhatsApp Blasts</p>
              <p className="text-xs text-muted-foreground">Target: {blastTarget} blasts/day</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Input
              type="number"
              min={0}
              value={blastInput}
              onChange={(e) => setBlastInput(e.target.value)}
              className="w-16 h-8 text-center text-sm"
            />
            <span className="text-xs text-muted-foreground">/ {blastTarget}</span>
            <Button size="sm" variant="outline" onClick={saveBlastCount}>Save</Button>
            <StatusIcon done={report.whatsapp_blast_count >= blastTarget} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
