import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera, Image, MessageSquare, CheckCircle, Clock, Upload, Loader2, AlertCircle, Eye } from 'lucide-react';
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

type UserType = 'staff' | 'hybrid' | 'doctor';

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
  const [shiftInfo, setShiftInfo] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType>('staff');
  const [rosterChecked, setRosterChecked] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const selfieRef = useRef<HTMLInputElement>(null);
  const stock1Ref = useRef<HTMLInputElement>(null);
  const stock2Ref = useRef<HTMLInputElement>(null);

  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Shift-aware upload windows (widened)
  const isAM = shiftInfo === 'AM';
  const isPM = shiftInfo === 'PM';

  const getUploadWindow = () => {
    if (userType === 'doctor') {
      if (isAM) return { start: 8, end: 16 };
      if (isPM) return { start: 16, end: 17 };
    }
    if (isAM) return { start: 8, end: 14 };
    if (isPM) return { start: 16, end: 17 };
    return { start: 0, end: 0 };
  };

  const window = getUploadWindow();
  const isUploadWindow = currentHour >= window.start && currentHour < window.end;

  const showStockAndBlast = userType === 'staff' || userType === 'hybrid';

  useEffect(() => {
    if (user) {
      fetchRosterAndReport();
    }
  }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('daily-reporting-card')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_rosters' }, () => {
        if (user) fetchRosterAndReport();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, (payload: any) => {
        if (payload.new?.user_id === user?.id || payload.old?.user_id === user?.id) {
          if (user) fetchRosterAndReport();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRosterAndReport = async () => {
    const month = now.getMonth();
    const year = now.getFullYear();

    const [supportRosterRes, doctorRosterRes, reportRes, settingRes] = await Promise.all([
      supabase.from('saved_rosters').select('roster_data').eq('roster_type', 'support').eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('saved_rosters').select('roster_data').eq('roster_type', 'doctor').eq('month', month).eq('year', year).maybeSingle(),
      supabase.from('daily_reports').select('*').eq('user_id', user!.id).eq('report_date', todayStr).maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', 'daily_whatsapp_blast_target').maybeSingle(),
    ]);

    const supportRoster = supportRosterRes.data?.roster_data as unknown as Record<string, {
      shift1?: { staffId: string }[];
      shift2?: { staffId: string }[];
      hybrid?: { staffId: string }[];
    }>;
    const todaySupportRoster = supportRoster?.[todayStr];

    let shift: string | null = null;
    let detectedType: UserType = 'staff';

    if (todaySupportRoster) {
      if (todaySupportRoster.shift1?.some(s => s.staffId === user!.id)) {
        shift = 'AM'; detectedType = 'staff';
      } else if (todaySupportRoster.shift2?.some(s => s.staffId === user!.id)) {
        shift = 'PM'; detectedType = 'staff';
      } else if (todaySupportRoster.hybrid?.some(s => s.staffId === user!.id)) {
        shift = 'AM'; detectedType = 'hybrid';
      }
    }

    if (!shift) {
      const doctorRoster = doctorRosterRes.data?.roster_data as unknown as Record<string, {
        shift1?: { staffId: string };
        shift2?: { staffId: string };
        shift3?: { staffId: string };
      }>;
      const todayDoctorRoster = doctorRoster?.[todayStr];

      if (todayDoctorRoster) {
        const isLocum = todayDoctorRoster.shift3?.staffId === user!.id;
        if (!isLocum) {
          if (todayDoctorRoster.shift1?.staffId === user!.id) {
            shift = 'AM'; detectedType = 'doctor';
          } else if (todayDoctorRoster.shift2?.staffId === user!.id) {
            shift = 'PM'; detectedType = 'doctor';
          }
        }
      }
    }

    setShiftInfo(shift);
    setUserType(detectedType);
    setRosterChecked(true);

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

      const { error: uploadError } = await supabase.storage.from('daily-reports').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('daily-reports').getPublicUrl(path);
      const url = urlData.publicUrl;

      if (report.id) {
        await supabase.from('daily_reports').update({ [field]: url }).eq('id', report.id);
      } else {
        const { data: inserted } = await supabase.from('daily_reports').insert({
          user_id: user.id, report_date: todayStr, [field]: url,
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
          user_id: user.id, report_date: todayStr, whatsapp_blast_count: count,
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

  const PhotoPreviewBadge = ({ url, label }: { url: string; label: string }) => (
    <button
      onClick={() => { setPreviewUrl(url); setPreviewTitle(label); }}
      className="flex items-center gap-1 cursor-pointer"
    >
      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs gap-1 hover:bg-green-200 dark:hover:bg-green-800 transition-colors">
        <Eye className="h-3 w-3" />
        View
      </Badge>
    </button>
  );

  if (loading) return null;

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

  const shiftLabel = userType === 'doctor'
    ? (shiftInfo === 'AM' ? '🩺 Doctor AM Shift' : '🩺 Doctor PM Shift')
    : userType === 'hybrid'
    ? '🔄 Hybrid (8am–1pm)'
    : (shiftInfo === 'AM' ? '☀️ AM Shift (8am–2pm)' : '🌙 PM Shift (2pm–8pm)');

  const uploadWindowLabel = `${window.start > 12 ? window.start - 12 : window.start}:00 ${window.start >= 12 ? 'PM' : 'AM'} – ${window.end > 12 ? window.end - 12 : window.end}:00 ${window.end >= 12 ? 'PM' : 'AM'}`;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">📋 Daily Reporting — {format(now, 'dd MMM yyyy')}</CardTitle>
            <Badge variant="secondary" className="text-xs">{shiftLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Briefing Selfie */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3 min-w-0">
              <Camera className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{isPM ? 'Evening Passover Selfie' : 'Morning Briefing Selfie'}</p>
                <p className="text-xs text-muted-foreground">Upload window: {uploadWindowLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusIcon done={!!report.briefing_selfie_url} />
              {report.briefing_selfie_url ? (
                <PhotoPreviewBadge url={report.briefing_selfie_url} label={isPM ? 'Evening Passover Selfie' : 'Morning Briefing Selfie'} />
              ) : (
                <>
                  <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], 'briefing_selfie_url')} />
                  <Button size="sm" variant="outline" disabled={!isUploadWindow || uploading.briefing_selfie_url}
                    onClick={() => selfieRef.current?.click()}>
                    {uploading.briefing_selfie_url ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    Upload
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Stock Photos */}
          {showStockAndBlast && (
            <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Medication Stock Photos</p>
                  <p className="text-xs text-muted-foreground">Upload window: {uploadWindowLabel} • Must include timestamp & date stamp</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['stock_photo_1_url', 'stock_photo_2_url'] as const).map((field, i) => (
                  <div key={field} className="flex items-center justify-between gap-2 p-2 rounded border bg-background">
                    <span className="text-xs font-medium">Photo {i + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon done={!!report[field]} />
                      {report[field] ? (
                        <PhotoPreviewBadge url={report[field]!} label={`Stock Photo ${i + 1}`} />
                      ) : (
                        <>
                          <input ref={i === 0 ? stock1Ref : stock2Ref} type="file" accept="image/*" className="hidden"
                            onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0], field)} />
                          <Button size="sm" variant="outline" disabled={!isUploadWindow || uploading[field]}
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
          )}

          {/* WhatsApp Blast Count */}
          {showStockAndBlast && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">WhatsApp Blasts</p>
                  <p className="text-xs text-muted-foreground">Target: {blastTarget} blasts/day</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Input type="number" min={0} value={blastInput} onChange={(e) => setBlastInput(e.target.value)}
                  className="w-16 h-8 text-center text-sm" />
                <span className="text-xs text-muted-foreground">/ {blastTarget}</span>
                <Button size="sm" variant="outline" onClick={saveBlastCount}>Save</Button>
                <StatusIcon done={report.whatsapp_blast_count >= blastTarget} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewTitle}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img src={previewUrl} alt={previewTitle} className="w-full rounded-lg object-contain max-h-[70vh]" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
