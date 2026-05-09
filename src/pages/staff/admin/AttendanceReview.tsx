import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';
import { CalendarCheck, CalendarOff, AlertTriangle, Clock, Download, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { bento, bentoHeader, pageInner, pageShell, primaryBtn, secondaryBtn, softBadge, softInput, chartColors } from '@/lib/clinic/bentoTokens';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import {
  getAllShiftsForMonth,
  calculateLatenessMinutes,
  getLatenessSeverity,
  getLatenessColorClasses,
  calculateDailyWorkHours,
  formatWorkHours,
  DEFAULT_SHIFT_START,
  type ShiftInfo,
  type LatenessSeverity,
} from '@/lib/rosterUtils';
import { logicalWorkDateOf } from '@/lib/attendanceUtils';
import { ManualPunchDialog } from '@/components/staff/admin/ManualPunchDialog';

const COLORS = {
  working: 'hsl(142, 76%, 36%)',
  leave: 'hsl(217, 91%, 60%)',
  absent: 'hsl(0, 84%, 60%)',
  late: 'hsl(45, 93%, 47%)',
};

const chartConfig = {
  working: { label: 'Working', color: COLORS.working },
  leave: { label: 'Leave', color: COLORS.leave },
  absent: { label: 'Absent', color: COLORS.absent },
  late: { label: 'Late', color: COLORS.late },
};

type DetailRecord = {
  fullName: string;
  date: string;
  expectedClockIn: string;
  actualClockIn: string;
  latenessDuration: string;
  status: string;
  severity: LatenessSeverity;
  workHours: string;
};

export default function AdminAttendanceReview() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<Record<string, Record<string, ShiftInfo>>>({});

  const monthStart = startOfMonth(new Date(selectedYear, selectedMonth));
  const monthEnd = endOfMonth(monthStart);

  // Fetch all roster shifts for the month
  useEffect(() => {
    getAllShiftsForMonth(selectedMonth, selectedYear).then(setAllShifts);
  }, [selectedMonth, selectedYear]);

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ['admin-attendance', selectedYear, selectedMonth],
    queryFn: async () => {
      const fetchStart = new Date(monthStart); fetchStart.setDate(fetchStart.getDate() - 1);
      const fetchEnd = new Date(monthEnd); fetchEnd.setDate(fetchEnd.getDate() + 1);
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .gte('punch_time', fetchStart.toISOString())
        .lte('punch_time', fetchEnd.toISOString());
      return data || [];
    },
  });

  const { data: leaveRequests } = useQuery({
    queryKey: ['admin-leaves', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'approved')
        .lte('start_date', format(monthEnd, 'yyyy-MM-dd'))
        .gte('end_date', format(monthStart, 'yyyy-MM-dd'));
      return data || [];
    },
  });

  const positions = useMemo(() => {
    if (!profiles) return [];
    const pos = new Set(profiles.map(p => p.position).filter(Boolean));
    return Array.from(pos) as string[];
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter(p => {
      const matchesSearch = !searchQuery || (p.full_name || p.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPosition = positionFilter === 'all' || p.position === positionFilter;
      return matchesSearch && matchesPosition;
    });
  }, [profiles, searchQuery, positionFilter]);

  const stats = useMemo(() => {
    const workingDays = eachDayOfInterval({ start: monthStart, end: monthEnd > now ? now : monthEnd })
      .filter(d => !isWeekend(d));

    let totalPresent = 0, totalLeave = 0, totalAbsent = 0, totalLate = 0;
    const details: { working: DetailRecord[]; leave: DetailRecord[]; absent: DetailRecord[]; late: DetailRecord[] } = {
      working: [], leave: [], absent: [], late: [],
    };

    filteredProfiles.forEach(profile => {
      const userAttendance = (attendance || []).filter(a => a.user_id === profile.id);
      const userLeaves = (leaveRequests || []).filter(l => l.user_id === profile.id);
      const userShifts = allShifts[profile.id] || {};

      workingDays.forEach(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const isOnLeave = userLeaves.some(l => l.start_date <= dayStr && l.end_date >= dayStr);
        const dayRecords = userAttendance.filter((a: any) => logicalWorkDateOf(a) === dayStr);
        const punchIn = dayRecords.find((a: any) => a.punch_type === 'in');
        const punchOut = dayRecords.find((a: any) => a.punch_type === 'out');
        const shiftStart = userShifts[dayStr]?.start || DEFAULT_SHIFT_START;

        // Calculate work hours
        let workHoursStr = '-';
        if (punchIn && punchOut) {
          const wh = calculateDailyWorkHours(new Date(punchIn.punch_time), new Date(punchOut.punch_time));
          workHoursStr = formatWorkHours(wh);
        }

        const fullName = profile.full_name || profile.email;

        if (isOnLeave) {
          totalLeave++;
          details.leave.push({ fullName, date: dayStr, expectedClockIn: shiftStart, actualClockIn: '-', latenessDuration: '-', status: 'Leave', severity: 'on_time', workHours: '-' });
        } else if (punchIn) {
          const punchTime = new Date(punchIn.punch_time);
          const lateMin = calculateLatenessMinutes(punchTime, shiftStart, day);
          const severity = getLatenessSeverity(lateMin);

          if (severity === 'late') {
            totalLate++;
            details.late.push({ fullName, date: dayStr, expectedClockIn: shiftStart, actualClockIn: format(punchTime, 'HH:mm'), latenessDuration: `${Math.round(lateMin)} min`, status: 'Late (≥15 min)', severity, workHours: workHoursStr });
          } else if (severity === 'minor_late') {
            totalLate++;
            details.late.push({ fullName, date: dayStr, expectedClockIn: shiftStart, actualClockIn: format(punchTime, 'HH:mm'), latenessDuration: `${Math.round(lateMin)} min`, status: 'Minor Late (1-14 min)', severity, workHours: workHoursStr });
          } else {
            totalPresent++;
            details.working.push({ fullName, date: dayStr, expectedClockIn: shiftStart, actualClockIn: format(punchTime, 'HH:mm'), latenessDuration: '-', status: 'On Time', severity, workHours: workHoursStr });
          }
        } else {
          totalAbsent++;
          details.absent.push({ fullName, date: dayStr, expectedClockIn: shiftStart, actualClockIn: '-', latenessDuration: '-', status: 'Absent', severity: 'on_time', workHours: '-' });
        }
      });
    });

    return { totalPresent, totalLeave, totalAbsent, totalLate, details };
  }, [filteredProfiles, attendance, leaveRequests, monthStart, monthEnd, allShifts]);

  const chartData = [
    { name: 'working', value: stats.totalPresent },
    { name: 'leave', value: stats.totalLeave },
    { name: 'absent', value: stats.totalAbsent },
    { name: 'late', value: stats.totalLate },
  ].filter(d => d.value > 0);

  const exportCSV = () => {
    const allRecords = [...stats.details.working, ...stats.details.leave, ...stats.details.absent, ...stats.details.late];
    allRecords.sort((a, b) => a.date.localeCompare(b.date) || a.fullName.localeCompare(b.fullName));
    const header = 'Full Name,Date,Expected Clock-In,Actual Clock-In,Lateness Duration,Work Hours,Status\n';
    const rows = allRecords.map(r => `"${r.fullName}","${r.date}","${r.expectedClockIn}","${r.actualClockIn}","${r.latenessDuration}","${r.workHours}","${r.status}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: format(new Date(2024, i), 'MMMM'),
  }));

  const drillDownRecords = drillDown ? stats.details[drillDown as keyof typeof stats.details] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Attendance Review</h1>
        <div className="flex gap-2">
          <ManualPunchDialog />
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Search staff..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-[200px]" />
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Positions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            {positions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:ring-2 ring-primary/30 transition" onClick={() => setDrillDown(drillDown === 'working' ? null : 'working')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full p-2 bg-green-100 text-green-600"><CalendarCheck className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">Present</p><p className="text-2xl font-bold">{stats.totalPresent}</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-primary/30 transition" onClick={() => setDrillDown(drillDown === 'leave' ? null : 'leave')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full p-2 bg-blue-100 text-blue-600"><CalendarOff className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">Leave</p><p className="text-2xl font-bold">{stats.totalLeave}</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-primary/30 transition" onClick={() => setDrillDown(drillDown === 'absent' ? null : 'absent')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full p-2 bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">Absent</p><p className="text-2xl font-bold">{stats.totalAbsent}</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-primary/30 transition" onClick={() => setDrillDown(drillDown === 'late' ? null : 'late')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full p-2 bg-yellow-100 text-yellow-600"><Clock className="h-5 w-5" /></div>
            <div><p className="text-sm text-muted-foreground">Late</p><p className="text-2xl font-bold">{stats.totalLate}</p></div>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Attendance Overview</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <ChartContainer config={chartConfig} className="h-[300px] w-[300px]">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                  onClick={(_, index) => { const key = chartData[index].name; setDrillDown(drillDown === key ? null : key); }}
                  className="cursor-pointer"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} stroke="transparent" />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
          <div className="flex justify-center gap-6 pb-4 flex-wrap">
            {chartData.map(d => (
              <button key={d.name} className="flex items-center gap-2 text-sm hover:underline" onClick={() => setDrillDown(drillDown === d.name ? null : d.name)}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[d.name as keyof typeof COLORS] }} />
                {chartConfig[d.name as keyof typeof chartConfig]?.label}: {d.value}
              </button>
            ))}
          </div>
        </Card>
      )}

      {drillDown && drillDownRecords && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setDrillDown(null)}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle>{chartConfig[drillDown as keyof typeof chartConfig]?.label} Details ({drillDownRecords.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Expected Clock-In</TableHead>
                    <TableHead>Actual Clock-In</TableHead>
                    <TableHead>Lateness</TableHead>
                    <TableHead>Work Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillDownRecords.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.expectedClockIn}</TableCell>
                      <TableCell>{r.actualClockIn}</TableCell>
                      <TableCell>{r.latenessDuration}</TableCell>
                      <TableCell className="text-xs">{r.workHours}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLatenessColorClasses(r.severity)}`}>
                          {r.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
