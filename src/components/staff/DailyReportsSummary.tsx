import { useEffect, useState } from 'react';
import { bento, bentoHeader, secondaryBtn, softInput } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, ClipboardList, Settings2, Sun, Moon, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface StaffReport {
  userId: string;
  fullName: string;
  shift: 'AM' | 'PM';
  type: 'Staff' | 'Hybrid' | 'Doctor';
  selfie: boolean;
  stock1: boolean | null; // null = N/A for doctors
  stock2: boolean | null;
  blastCount: number | null; // null = N/A for doctors
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

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('daily-reports-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_rosters' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch support roster, doctor roster, and blast target setting
    const [supportRosterRes, doctorRosterRes, settingRes] = await Promise.all([
      supabase
        .from('saved_rosters')
        .select('roster_data, staff_list')
        .eq('roster_type', 'support')
        .eq('month', selectedMonth + 1)
        .eq('year', selectedYear)
        .maybeSingle(),
      supabase
        .from('saved_rosters')
        .select('roster_data, staff_list')
        .eq('roster_type', 'doctor')
        .eq('month', selectedMonth + 1)
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

    const supportRosterData = supportRosterRes.data?.roster_data as unknown as Record<string, Record<string, any>>;
    const doctorRosterData = doctorRosterRes.data?.roster_data as unknown as Record<string, Record<string, any>>;

    // Normalize raw shift keys (shift1/S1/DOC_S1, etc.) into AM/PM buckets.
    const supportShiftBucket = (raw: string): 'AM' | 'PM' | 'HYBRID' | null => {
      const k = raw.toLowerCase();
      if (k === 'shift1' || k === 's1' || k === 'doc_s1') return 'AM';
      if (k === 'shift2' || k === 's2' || k === 'doc_s2' || k === 'shift3' || k === 's3' || k === 'doc_s3' || k === 'night') return 'PM';
      if (k === 'hybrid') return 'HYBRID';
      return null;
    };
    const doctorShiftBucket = (raw: string): 'AM' | 'PM' | 'LOCUM' | null => {
      const k = raw.toLowerCase();
      if (k === 'shift1' || k === 's1' || k === 'doc_s1') return 'AM';
      if (k === 'shift2' || k === 's2' || k === 'doc_s2') return 'PM';
      if (k === 'shift3' || k === 's3' || k === 'doc_s3' || k === 'night') return 'LOCUM';
      return null;
    };
    const cellsOf = (v: any): { staffId: string; staffName: string }[] =>
      Array.isArray(v) ? v.filter(Boolean) : v && typeof v === 'object' && v.staffId ? [v] : [];

    // Determine date key
    const dateKey = isCurrentMonth
      ? todayStr
      : (supportRosterData ? Object.keys(supportRosterData).sort().pop() : doctorRosterData ? Object.keys(doctorRosterData).sort().pop() : null);

    if (!dateKey) {
      setReports([]);
      setLoading(false);
      return;
    }

    // Collect staff entries from support roster
    const staffEntries: { staffId: string; staffName: string; shift: 'AM' | 'PM'; type: 'Staff' | 'Hybrid' | 'Doctor' }[] = [];
    const daySupportRoster = supportRosterData?.[dateKey];

    if (daySupportRoster) {
      for (const [rawKey, val] of Object.entries(daySupportRoster)) {
        const bucket = supportShiftBucket(rawKey);
        if (!bucket) continue;
        cellsOf(val).forEach(s => {
          if (!s.staffId) return;
          if (bucket === 'HYBRID') {
            staffEntries.push({ staffId: s.staffId, staffName: s.staffName, shift: 'AM', type: 'Hybrid' });
          } else {
            staffEntries.push({ staffId: s.staffId, staffName: s.staffName, shift: bucket, type: 'Staff' });
          }
        });
      }
    }

    // Collect doctor entries (non-locum)
    const dayDoctorRoster = doctorRosterData?.[dateKey];
    if (dayDoctorRoster) {
      // Identify locum staffId (any S3-like key)
      let locumId: string | undefined;
      for (const [rawKey, val] of Object.entries(dayDoctorRoster)) {
        if (doctorShiftBucket(rawKey) === 'LOCUM') {
          const c = cellsOf(val)[0];
          if (c?.staffId) { locumId = c.staffId; break; }
        }
      }
      for (const [rawKey, val] of Object.entries(dayDoctorRoster)) {
        const bucket = doctorShiftBucket(rawKey);
        if (bucket !== 'AM' && bucket !== 'PM') continue;
        cellsOf(val).forEach(c => {
          if (!c.staffId || c.staffId === locumId) return;
          staffEntries.push({ staffId: c.staffId, staffName: c.staffName, shift: bucket, type: 'Doctor' });
        });
      }
    }

    // Deduplicate same staff/shift/type combinations
    const seen = new Set<string>();
    const uniqueEntries = staffEntries.filter(e => {
      const k = `${e.staffId}-${e.shift}-${e.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (uniqueEntries.length === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    // Fetch daily reports for that date
    const { data: dailyReports } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', dateKey)
      .in('user_id', uniqueEntries.map(s => s.staffId));

    const reportMap = new Map<string, any>();
    dailyReports?.forEach(r => reportMap.set(r.user_id, r));

    const staffReports: StaffReport[] = uniqueEntries.map(s => {
      const r = reportMap.get(s.staffId);
      const isDoctor = s.type === 'Doctor';
      const selfieUrl = s.shift === 'PM' ? r?.evening_selfie_url : r?.briefing_selfie_url;
      return {
        userId: s.staffId,
        fullName: s.staffName,
        shift: s.shift,
        type: s.type,
        selfie: !!selfieUrl,
        stock1: isDoctor ? null : !!r?.stock_photo_1_url,
        stock2: isDoctor ? null : !!r?.stock_photo_2_url,
        blastCount: isDoctor ? null : (r?.whatsapp_blast_count || 0),
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

  const Check = () => <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />;
  const Cross = () => <XCircle className="h-4 w-4 text-rose-400 mx-auto" />;
  const NA = () => <Minus className="h-4 w-4 text-slate-400 mx-auto" />;

  const amReports = reports.filter(r => r.shift === 'AM');
  const pmReports = reports.filter(r => r.shift === 'PM');

  const TypeBadge = ({ type }: { type: string }) => {
    if (type === 'Doctor') return <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Dr</Badge>;
    if (type === 'Hybrid') return <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">H</Badge>;
    return null;
  };

  const ShiftTable = ({ title, icon, data }: { title: string; icon: React.ReactNode; data: StaffReport[] }) => {
    if (data.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">{icon} {title}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="text-left py-2 pr-3 font-medium">Staff</th>
              <th className="text-center py-2 px-2 font-medium">Selfie</th>
              <th className="text-center py-2 px-2 font-medium">Stock 1</th>
              <th className="text-center py-2 px-2 font-medium">Stock 2</th>
              <th className="text-center py-2 pl-2 font-medium">WA Blasts</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={`${r.userId}-${r.type}`} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-700">
                  {r.fullName}
                  <TypeBadge type={r.type} />
                </td>
                <td className="py-2 px-2">{r.selfie ? <Check /> : <Cross />}</td>
                <td className="py-2 px-2">{r.stock1 === null ? <NA /> : r.stock1 ? <Check /> : <Cross />}</td>
                <td className="py-2 px-2">{r.stock2 === null ? <NA /> : r.stock2 ? <Check /> : <Cross />}</td>
                <td className="py-2 pl-2 text-center">
                  {r.blastCount === null ? (
                    <span className="text-xs text-slate-500">—</span>
                  ) : (
                    <Badge variant={r.blastCount >= blastTarget ? 'secondary' : 'destructive'}
                      className={r.blastCount >= blastTarget
                        ? 'bg-emerald-50 text-emerald-700 text-xs border-none'
                        : 'text-xs'}>
                      {r.blastCount} / {blastTarget}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={cn(bento, 'p-4 md:p-5')}>
      <div className="pb-3 mb-3 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className={cn(bentoHeader, 'mb-0 normal-case tracking-normal text-base flex items-center gap-2')}>
            <ClipboardList className="h-5 w-5 text-blue-600" /> Daily Reports
            {isCurrentMonth && <span className="text-slate-500 font-normal">— {format(now, 'dd MMM')}</span>}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className={cn(softInput, 'w-20 h-7 text-xs')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className={cn(softInput, 'w-20 h-7 text-xs')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 ml-2">
              <Settings2 className="h-4 w-4 text-slate-400" />
              <span className="text-xs text-slate-500">WA:</span>
              <Input type="number" min={1} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className={cn(softInput, 'w-14 h-7 text-center text-xs')} />
              <Button size="sm" className={cn(secondaryBtn, 'h-7 text-xs')} onClick={saveTarget} disabled={saving}>Set</Button>
            </div>
          </div>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-slate-500">No roster data found for this period.</p>
      ) : (
        <div className="space-y-4 overflow-x-auto">
          <ShiftTable title="AM Shift (8am–4pm)" icon={<Sun className="h-3.5 w-3.5 text-amber-500" />} data={amReports} />
          <ShiftTable title="PM Shift (4pm–12am)" icon={<Moon className="h-3.5 w-3.5 text-indigo-500" />} data={pmReports} />
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <Button asChild className={cn(secondaryBtn, 'text-xs h-8')}>
          <Link to="/staff/admin/daily-tasks">View Full Daily Task Review →</Link>
        </Button>
      </div>
    </div>
  );
}
