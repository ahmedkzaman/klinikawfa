import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, ClipboardList, Download, Sun, Moon, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDaysInMonth } from 'date-fns';
import { toast } from 'sonner';

interface RosterEntry { staffId: string; staffName: string; }
interface DayRoster {
  shift1?: RosterEntry[];
  shift2?: RosterEntry[];
  hybrid?: RosterEntry[];
}
interface DoctorDayRoster {
  shift1?: { staffId: string; staffName: string };
  shift2?: { staffId: string; staffName: string };
  shift3?: { staffId: string; staffName: string };
}
interface DailyReportRow {
  user_id: string;
  report_date: string;
  briefing_selfie_url: string | null;
  stock_photo_1_url: string | null;
  stock_photo_2_url: string | null;
  whatsapp_blast_count: number | null;
}

type EntryType = 'Staff' | 'Hybrid' | 'Doctor';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function DailyTaskReview() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [supportRosterData, setSupportRosterData] = useState<Record<string, DayRoster>>({});
  const [doctorRosterData, setDoctorRosterData] = useState<Record<string, DoctorDayRoster>>({});
  const [reports, setReports] = useState<DailyReportRow[]>([]);
  const [blastTarget, setBlastTarget] = useState(5);
  const [loading, setLoading] = useState(true);
  const [allStaff, setAllStaff] = useState<{ id: string; name: string; type: EntryType }[]>([]);

  useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('daily-task-review')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_rosters' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    const [supportRes, doctorRes, settingRes] = await Promise.all([
      supabase
        .from('saved_rosters')
        .select('roster_data, staff_list')
        .eq('roster_type', 'support')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle(),
      supabase
        .from('saved_rosters')
        .select('roster_data, staff_list')
        .eq('roster_type', 'doctor')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'daily_whatsapp_blast_target')
        .maybeSingle(),
    ]);

    setBlastTarget(parseInt(settingRes.data?.value || '5') || 5);

    const sRoster = supportRes.data?.roster_data as unknown as Record<string, DayRoster> || {};
    const dRoster = doctorRes.data?.roster_data as unknown as Record<string, DoctorDayRoster> || {};
    const supportStaffList = supportRes.data?.staff_list as unknown as { id: string; name: string }[] || [];

    setSupportRosterData(sRoster);
    setDoctorRosterData(dRoster);

    // Build combined staff list
    const staffMap = new Map<string, { id: string; name: string; type: EntryType }>();
    supportStaffList.forEach(s => staffMap.set(s.id, { id: s.id, name: s.name, type: 'Staff' }));

    // Add doctors from roster data
    Object.values(dRoster).forEach(day => {
      if (day.shift1 && !staffMap.has(day.shift1.staffId)) {
        staffMap.set(day.shift1.staffId, { id: day.shift1.staffId, name: day.shift1.staffName, type: 'Doctor' });
      }
      if (day.shift2 && !staffMap.has(day.shift2.staffId)) {
        staffMap.set(day.shift2.staffId, { id: day.shift2.staffId, name: day.shift2.staffName, type: 'Doctor' });
      }
    });

    setAllStaff(Array.from(staffMap.values()));

    // Fetch all daily reports for the month
    const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth));
    const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: reportsData } = await supabase
      .from('daily_reports')
      .select('user_id, report_date, briefing_selfie_url, stock_photo_1_url, stock_photo_2_url, whatsapp_blast_count')
      .gte('report_date', startDate)
      .lte('report_date', endDate);

    setReports(reportsData || []);
    setLoading(false);
  };

  const reportMap = useMemo(() => {
    const m = new Map<string, DailyReportRow>();
    reports.forEach(r => m.set(`${r.user_id}-${r.report_date}`, r));
    return m;
  }, [reports]);

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    });
  }, [selectedMonth, selectedYear]);

  const filteredStaffIds = selectedStaff === 'all' ? allStaff.map(s => s.id) : [selectedStaff];
  const staffNameMap = useMemo(() => {
    const m = new Map<string, string>();
    allStaff.forEach(s => m.set(s.id, s.name));
    return m;
  }, [allStaff]);

  // Build entries for each day combining support + doctor rosters
  const buildDayEntries = (dateKey: string) => {
    const entries: { staffId: string; staffName: string; shift: 'AM' | 'PM'; type: EntryType }[] = [];

    const daySupportRoster = supportRosterData[dateKey];
    if (daySupportRoster) {
      daySupportRoster.shift1?.forEach(s => {
        if (filteredStaffIds.includes(s.staffId)) entries.push({ ...s, shift: 'AM', type: 'Staff' });
      });
      daySupportRoster.shift2?.forEach(s => {
        if (filteredStaffIds.includes(s.staffId)) entries.push({ ...s, shift: 'PM', type: 'Staff' });
      });
      daySupportRoster.hybrid?.forEach(s => {
        if (filteredStaffIds.includes(s.staffId)) entries.push({ ...s, shift: 'AM', type: 'Hybrid' });
      });
    }

    const dayDoctorRoster = doctorRosterData[dateKey];
    if (dayDoctorRoster) {
      const locumId = dayDoctorRoster.shift3?.staffId;
      if (dayDoctorRoster.shift1 && dayDoctorRoster.shift1.staffId !== locumId && filteredStaffIds.includes(dayDoctorRoster.shift1.staffId)) {
        entries.push({ staffId: dayDoctorRoster.shift1.staffId, staffName: dayDoctorRoster.shift1.staffName, shift: 'AM', type: 'Doctor' });
      }
      if (dayDoctorRoster.shift2 && dayDoctorRoster.shift2.staffId !== locumId && filteredStaffIds.includes(dayDoctorRoster.shift2.staffId)) {
        entries.push({ staffId: dayDoctorRoster.shift2.staffId, staffName: dayDoctorRoster.shift2.staffName, shift: 'PM', type: 'Doctor' });
      }
    }

    return entries;
  };

  // Summary stats
  const summaryStats = useMemo(() => {
    const stats: Record<string, { total: number; selfie: number; stock1: number; stock2: number; blastMet: number; type: EntryType }> = {};

    days.forEach(dateKey => {
      const entries = buildDayEntries(dateKey);
      entries.forEach(entry => {
        if (!stats[entry.staffId]) {
          stats[entry.staffId] = { total: 0, selfie: 0, stock1: 0, stock2: 0, blastMet: 0, type: entry.type };
        }
        stats[entry.staffId].total++;
        const r = reportMap.get(`${entry.staffId}-${dateKey}`);
        if (r?.briefing_selfie_url) stats[entry.staffId].selfie++;
        if (entry.type !== 'Doctor') {
          if (r?.stock_photo_1_url) stats[entry.staffId].stock1++;
          if (r?.stock_photo_2_url) stats[entry.staffId].stock2++;
          if ((r?.whatsapp_blast_count || 0) >= blastTarget) stats[entry.staffId].blastMet++;
        }
      });
    });
    return stats;
  }, [days, supportRosterData, doctorRosterData, reportMap, filteredStaffIds, blastTarget]);

  const downloadCSV = () => {
    const rows: string[] = ['Date,Staff,Type,Shift,Selfie,Stock 1,Stock 2,WA Blasts'];
    days.forEach(dateKey => {
      const entries = buildDayEntries(dateKey);
      entries.forEach(entry => {
        const r = reportMap.get(`${entry.staffId}-${dateKey}`);
        const isDoctor = entry.type === 'Doctor';
        rows.push([
          dateKey,
          `"${entry.staffName}"`,
          entry.type,
          entry.shift,
          r?.briefing_selfie_url ? 'Yes' : 'No',
          isDoctor ? 'N/A' : (r?.stock_photo_1_url ? 'Yes' : 'No'),
          isDoctor ? 'N/A' : (r?.stock_photo_2_url ? 'Yes' : 'No'),
          isDoctor ? 'N/A' : String(r?.whatsapp_blast_count || 0),
        ].join(','));
      });
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-tasks-${MONTHS[selectedMonth]}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  const Check = () => <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
  const Cross = () => <XCircle className="h-3.5 w-3.5 text-red-400" />;
  const NA = () => <Minus className="h-3.5 w-3.5 text-muted-foreground" />;

  const TypeBadge = ({ type }: { type: EntryType }) => {
    if (type === 'Doctor') return <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Dr</Badge>;
    if (type === 'Hybrid') return <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">H</Badge>;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Task Review</h1>
          <p className="text-muted-foreground text-sm">Review staff daily report submissions by month</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} disabled={loading || reports.length === 0}>
          <Download className="h-4 w-4 mr-1.5" /> Download CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Month:</span>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Year:</span>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Staff:</span>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All Staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  {allStaff.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.type === 'Doctor' ? '(Dr)' : s.type === 'Hybrid' ? '(H)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {MONTHS[selectedMonth]} {selectedYear} — Daily Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : Object.keys(supportRosterData).length === 0 && Object.keys(doctorRosterData).length === 0 ? (
            <p className="text-sm text-muted-foreground">No roster published for this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium sticky left-0 bg-background">Date</th>
                    <th className="text-left py-2 px-2 font-medium">Staff</th>
                    <th className="text-center py-2 px-2 font-medium">Type</th>
                    <th className="text-center py-2 px-2 font-medium">Shift</th>
                    <th className="text-center py-2 px-2 font-medium">Selfie</th>
                    <th className="text-center py-2 px-2 font-medium">Stock 1</th>
                    <th className="text-center py-2 px-2 font-medium">Stock 2</th>
                    <th className="text-center py-2 px-2 font-medium">WA Blasts</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(dateKey => {
                    const entries = buildDayEntries(dateKey);
                    if (entries.length === 0) return null;

                    return entries.map((entry, idx) => {
                      const r = reportMap.get(`${entry.staffId}-${dateKey}`);
                      const dayNum = parseInt(dateKey.split('-')[2]);
                      const dayName = format(new Date(dateKey), 'EEE');
                      const isDoctor = entry.type === 'Doctor';
                      return (
                        <tr key={`${dateKey}-${entry.staffId}-${entry.type}`} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 pr-3 font-medium sticky left-0 bg-background">
                            {idx === 0 && <span>{dayNum} {dayName}</span>}
                          </td>
                          <td className="py-1.5 px-2">{entry.staffName}</td>
                          <td className="py-1.5 px-2 text-center"><TypeBadge type={entry.type} /></td>
                          <td className="py-1.5 px-2 text-center">
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              {entry.shift === 'AM'
                                ? <><Sun className="h-3 w-3 mr-0.5 text-amber-500 inline" />AM</>
                                : <><Moon className="h-3 w-3 mr-0.5 text-indigo-500 inline" />PM</>
                              }
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 text-center">{r?.briefing_selfie_url ? <Check /> : <Cross />}</td>
                          <td className="py-1.5 px-2 text-center">{isDoctor ? <NA /> : (r?.stock_photo_1_url ? <Check /> : <Cross />)}</td>
                          <td className="py-1.5 px-2 text-center">{isDoctor ? <NA /> : (r?.stock_photo_2_url ? <Check /> : <Cross />)}</td>
                          <td className="py-1.5 px-2 text-center">
                            {isDoctor ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <Badge variant={(r?.whatsapp_blast_count || 0) >= blastTarget ? 'secondary' : 'destructive'}
                                className={(r?.whatsapp_blast_count || 0) >= blastTarget
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]'
                                  : 'text-[10px]'}>
                                {r?.whatsapp_blast_count || 0}/{blastTarget}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {!loading && Object.keys(summaryStats).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Summary — Completion Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">Staff</th>
                    <th className="text-center py-2 px-2 font-medium">Type</th>
                    <th className="text-center py-2 px-2 font-medium">Days On Duty</th>
                    <th className="text-center py-2 px-2 font-medium">Selfie %</th>
                    <th className="text-center py-2 px-2 font-medium">Stock 1 %</th>
                    <th className="text-center py-2 px-2 font-medium">Stock 2 %</th>
                    <th className="text-center py-2 px-2 font-medium">WA Target Met %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summaryStats).map(([id, s]) => {
                    if (s.total === 0) return null;
                    const pct = (n: number) => `${Math.round((n / s.total) * 100)}%`;
                    const isDoctor = s.type === 'Doctor';
                    return (
                      <tr key={id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{staffNameMap.get(id) || id.slice(0, 8)}</td>
                        <td className="py-2 px-2 text-center"><TypeBadge type={s.type} /></td>
                        <td className="py-2 px-2 text-center">{s.total}</td>
                        <td className="py-2 px-2 text-center">{pct(s.selfie)}</td>
                        <td className="py-2 px-2 text-center">{isDoctor ? '—' : pct(s.stock1)}</td>
                        <td className="py-2 px-2 text-center">{isDoctor ? '—' : pct(s.stock2)}</td>
                        <td className="py-2 px-2 text-center">{isDoctor ? '—' : pct(s.blastMet)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
