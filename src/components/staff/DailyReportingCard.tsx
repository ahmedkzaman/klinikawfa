import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Camera, Image, MessageSquare, CheckCircle, Clock, Upload, Loader2, AlertCircle } from 'lucide-react';
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
  const [shiftInfo, setShiftInfo] = useState<string | null>(null); // 'AM' | 'PM' | null
  const [rosterChecked, setRosterChecked] = useState(false);
  const selfieRef = useRef<HTMLInputElement>(null);
  const stock1Ref = useRef<HTMLInputElement>(null);
  const stock2Ref = useRef<HTMLInputElement>(null);

  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Shift-aware upload windows
  // AM: selfie 8-9am, stock 8-10am
  // PM: selfie 2-3pm, stock 2-3pm (single hour window)
  const isAM = shiftInfo === 'AM';
  const isPM = shiftInfo === 'PM';
  const isSelfieWindow = isAM ? (currentHour >= 8 && currentHour < 9) : isPM ? (currentHour >= 14 && currentHour < 15) : false;
  const isStockWindow = isAM ? (currentHour >= 8 && currentHour < 10) : isPM ? (currentHour >= 14 && currentHour < 15) : false;

  useEffect(() => {
    if (user) {
      fetchRosterAndReport();
    }
  }, [user]);

  const fetchRosterAndReport = async () => {
    const month = now.getMonth(); // 0-indexed (matches saved_rosters convention)
    const year = now.getFullYear();

    // Fetch roster, report, and blast target in parallel
    const [rosterRes, reportRes, settingRes] = await Promise.all([
      supabase
        .from('saved_rosters')
        .select('roster_data')
        .eq('roster_type', 'support')
        .eq('month', month)
        .eq('year', year)
        .maybeSingle(),
      supabase
        .from('daily_reports')
        .select('*')
        .eq('user_id', user!.id)
        .eq('report_date', todayStr)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'daily_whatsapp_blast_target')
        .maybeSingle(),
    ]);

    // Check roster
    const rosterData = rosterRes.data?.roster_data as unknown as Record<string, { shift1?: { staffId: string }[]; shift2?: { staffId: string }[] }>;
    const todayRoster = rosterData?.[todayStr];
    let shift: string | null = null;
    if (todayRoster) {
      if (todayRoster.shift1?.some(s => s.staffId === user!.id)) shift = 'AM';
      else if (todayRoster.shift2?.some(s => s.staffId === user!.id)) shift = 'PM';
    }
    setShiftInfo(shift);
    setRosterChecked(true);

    // Set report
    if (reportRes.data) {
      setReport({
        id: reportRes.data.id,
        briefing_selfie_url: reportRes.data.briefing_selfie_url,
        stock_photo_1_url: reportRes.data.stock_photo_1_url,
        stock_photo_2_url: reportRes.data.stock_photo_2_url,
        whatsapp_blast_count: reportRes.data.whatsapp_blast_count || 0,
      });
      setBlastInput(String(reportRes.data.whatsapp_blast_count || 0));
    }

    // Set blast target
    if (settingRes.data) setBlastTarget(parseInt(settingRes.data.value) || 5);

    setLoading(false);
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

      if (report.id) {
        await supabase.from('daily_reports').update({ [field]: url }).eq('id', report.id);
      } else {
        const { data: inserted } = await supabase.from('daily_reports').insert({
          user_id: user.id,
          report_date: todayStr,
          [field]: url,
        }).select().single();
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

  // Not on duty today
  if (rosterChecked && !shiftInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📋 Daily Reporting — {format(now, 'dd MMM yyyy')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed text-muted-foreground">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">You are not on duty today. No daily tasks required.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">📋 Daily Reporting — {format(now, 'dd MMM yyyy')}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {shiftInfo === 'AM' ? '☀️ AM Shift (8am–2pm)' : '🌙 PM Shift (2pm–8pm)'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Morning Briefing Selfie */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3 min-w-0">
            <Camera className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{isPM ? 'Shift Briefing Selfie' : 'Morning Briefing Selfie'}</p>
              <p className="text-xs text-muted-foreground">Upload window: {isPM ? '2:00 – 3:00 PM' : '8:00 – 9:00 AM'}</p>
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
              <p className="text-xs text-muted-foreground">Upload window: {isPM ? '2:00 – 3:00 PM' : '8:00 – 10:00 AM'} • Must include timestamp & date stamp</p>
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
