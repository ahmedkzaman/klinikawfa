import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, ClipboardList, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface StaffReport {
  userId: string;
  fullName: string;
  selfie: boolean;
  stock1: boolean;
  stock2: boolean;
  blastCount: number;
}

export default function DailyReportsSummary() {
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [blastTarget, setBlastTarget] = useState(5);
  const [targetInput, setTargetInput] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: profiles }, { data: dailyReports }, { data: setting }] = await Promise.all([
      supabase.from('profiles').select('id, full_name'),
      supabase.from('daily_reports').select('*').eq('report_date', todayStr),
      supabase.from('app_settings').select('value').eq('key', 'daily_whatsapp_blast_target').maybeSingle(),
    ]);

    const target = parseInt(setting?.value || '5') || 5;
    setBlastTarget(target);
    setTargetInput(String(target));

    const reportMap = new Map<string, any>();
    dailyReports?.forEach(r => reportMap.set(r.user_id, r));

    const staffReports: StaffReport[] = (profiles || []).map(p => {
      const r = reportMap.get(p.id);
      return {
        userId: p.id,
        fullName: p.full_name || p.id.slice(0, 8),
        selfie: !!r?.briefing_selfie_url,
        stock1: !!r?.stock_photo_1_url,
        stock2: !!r?.stock_photo_2_url,
        blastCount: r?.whatsapp_blast_count || 0,
      };
    });

    setReports(staffReports);
    setLoading(false);
  };

  const saveTarget = async () => {
    setSaving(true);
    const val = parseInt(targetInput) || 5;
    const { error } = await supabase
      .from('app_settings')
      .update({ value: String(val) })
      .eq('key', 'daily_whatsapp_blast_target');
    if (error) {
      toast.error('Failed to update target');
    } else {
      setBlastTarget(val);
      toast.success('WhatsApp blast target updated');
    }
    setSaving(false);
  };

  const Check = () => <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />;
  const Cross = () => <XCircle className="h-4 w-4 text-red-400 mx-auto" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Daily Reports — {format(new Date(), 'dd MMM')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">WA Target:</span>
            <Input
              type="number"
              min={1}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="w-14 h-7 text-center text-xs"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveTarget} disabled={saving}>
              Set
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Staff</th>
                  <th className="text-center py-2 px-2 font-medium">Selfie</th>
                  <th className="text-center py-2 px-2 font-medium">Stock 1</th>
                  <th className="text-center py-2 px-2 font-medium">Stock 2</th>
                  <th className="text-center py-2 pl-2 font-medium">WA Blasts</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.userId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.fullName}</td>
                    <td className="py-2 px-2">{r.selfie ? <Check /> : <Cross />}</td>
                    <td className="py-2 px-2">{r.stock1 ? <Check /> : <Cross />}</td>
                    <td className="py-2 px-2">{r.stock2 ? <Check /> : <Cross />}</td>
                    <td className="py-2 pl-2 text-center">
                      <Badge variant={r.blastCount >= blastTarget ? 'secondary' : 'destructive'}
                        className={r.blastCount >= blastTarget
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs'
                          : 'text-xs'}>
                        {r.blastCount} / {blastTarget}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
