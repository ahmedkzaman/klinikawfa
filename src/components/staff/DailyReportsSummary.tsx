import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, ClipboardList, Settings2, Sun, Moon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface StaffReport {
  userId: string;
  fullName: string;
  shift: 'AM' | 'PM';
  selfie: boolean;
  stock1: boolean;
  stock2: boolean;
  blastCount: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DailyReportsSummary() {
  const now = new Date();
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [blastTarget, setBlastTarget] = useState(5);
  const [targetInput, setTargetInput] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const todayStr = format(now, 'yyyy-MM-dd');

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch roster, daily reports, and blast target setting
    const [rosterRes, settingRes] = await Promise.all([
      supabase
        .from('saved_rosters')
        .select('roster_data, staff_list')
        .eq('roster_type', 'support')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'daily_whatsapp_blast_target')
        .maybeSingle(),
    ]);

    const target = parseInt(settingRes.data?.value || '5') || 5;
    setBlastTarget(target);
    setTargetInput(String(target));

    const rosterData = rosterRes.data?.roster_data as unknown as Record<string, { shift1?: { staffId: string; staffName: string }[]; shift2?: { staffId: string; staffName: string }[] }>;

    if (!rosterData) {
      setReports([]);
      setLoading(false);
      return;
    }

    // For current month, use today. For past months, show latest available day
    const dateKey = isCurrentMonth ? todayStr : Object.keys(rosterData).sort().pop();
    if (!dateKey) {
      setReports([]);
      setLoading(false);
      return;
    }

    const dayRoster = rosterData[dateKey];
    if (!dayRoster) {
      setReports([]);
      setLoading(false);
      return;
    }

    // Collect on-duty staff with shift info
    const staffEntries: { staffId: string; staffName: string; shift: 'AM' | 'PM' }[] = [];
    dayRoster.shift1?.forEach(s => staffEntries.push({ staffId: s.staffId, staffName: s.staffName, shift: 'AM' }));
    dayRoster.shift2?.forEach(s => staffEntries.push({ staffId: s.staffId, staffName: s.staffName, shift: 'PM' }));

    if (staffEntries.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    // Fetch daily reports for that date
    const { data: dailyReports } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', dateKey)
      .in('user_id', staffEntries.map(s => s.staffId));

    const reportMap = new Map<string, any>();
    dailyReports?.forEach(r => reportMap.set(r.user_id, r));

    const staffReports: StaffReport[] = staffEntries.map(s => {
      const r = reportMap.get(s.staffId);
      return {
        userId: s.staffId,
        fullName: s.staffName,
        shift: s.shift,
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

  const amReports = reports.filter(r => r.shift === 'AM');
  const pmReports = reports.filter(r => r.shift === 'PM');

  const ShiftTable = ({ title, icon, data }: { title: string; icon: React.ReactNode; data: StaffReport[] }) => {
    if (data.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">{icon} {title}</p>
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
            {data.map(r => (
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
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Daily Reports
            {isCurrentMonth && <span className="text-muted-foreground font-normal">— {format(now, 'dd MMM')}</span>}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 ml-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">WA:</span>
              <Input type="number" min={1} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="w-14 h-7 text-center text-xs" />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveTarget} disabled={saving}>Set</Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roster data found for this period.</p>
        ) : (
          <div className="space-y-4 overflow-x-auto">
            <ShiftTable title="AM Shift (8am–2pm)" icon={<Sun className="h-3.5 w-3.5 text-amber-500" />} data={amReports} />
            <ShiftTable title="PM Shift (2pm–8pm)" icon={<Moon className="h-3.5 w-3.5 text-indigo-500" />} data={pmReports} />
          </div>
        )}
        <div className="mt-3 pt-3 border-t">
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/staff/admin/daily-tasks">View Full Daily Task Review →</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
