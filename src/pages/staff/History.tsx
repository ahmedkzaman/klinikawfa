import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Clock, MapPin, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  getUserShiftsForMonth,
  getAllShiftsForMonth,
  calculateDailyWorkHours,
  formatWorkHours,
  calculateLatenessMinutes,
  getLatenessSeverity,
  getLatenessDotColor,
  DEFAULT_SHIFT_START,
  type ShiftInfo,
} from '@/lib/rosterUtils';
import { logicalWorkDateOf } from '@/lib/attendanceUtils';

export default function StaffHistory() {
  const { user, isAdmin } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [zones, setZones] = useState<Record<string, { id: string; name: string }>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [employeeList, setEmployeeList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [shifts, setShifts] = useState<Record<string, Record<string, ShiftInfo>>>({});

  useEffect(() => { if (user) { fetchRecords(); fetchZones(); if (isAdmin) fetchProfiles(); } }, [user, selectedMonth, selectedEmployee, isAdmin]);

  // Fetch roster shifts for the selected month
  useEffect(() => {
    if (!user) return;
    const month = selectedMonth.getMonth();
    const year = selectedMonth.getFullYear();
    if (isAdmin) {
      getAllShiftsForMonth(month, year).then(setShifts);
    } else {
      getUserShiftsForMonth(user.id, month, year).then(userShifts => {
        setShifts({ [user.id]: userShifts });
      });
    }
  }, [user, selectedMonth, isAdmin]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name');
    if (data) { const m: Record<string, string> = {}; data.forEach((p: any) => { m[p.id] = p.full_name; }); setProfiles(m); setEmployeeList(data); }
  };

  const fetchRecords = async () => {
    setIsLoading(true);
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    // Widen by ±1 day so cross-midnight punches hard-linked to days inside
    // the selected month are still included.
    const fetchStart = new Date(start); fetchStart.setDate(fetchStart.getDate() - 1);
    const fetchEnd = new Date(end); fetchEnd.setDate(fetchEnd.getDate() + 1);
    let query = supabase.from('attendance_records').select('id, user_id, punch_type, punch_time, zone_id, accuracy_meters, logical_work_date, shift_key')
      .gte('punch_time', fetchStart.toISOString()).lte('punch_time', fetchEnd.toISOString()).order('punch_time', { ascending: false });
    if (isAdmin) { if (selectedEmployee !== 'all') query = query.eq('user_id', selectedEmployee); }
    else query = query.eq('user_id', user?.id);
    const { data } = await query;
    if (data) setRecords(data);
    setIsLoading(false);
  };

  const fetchZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('id, name');
    if (data) { const m: Record<string, any> = {}; data.forEach((z) => { m[z.id] = z; }); setZones(m); }
  };

  const groupedRecords: Record<string, any[]> = records.reduce((acc: Record<string, any[]>, record: any) => {
    const dateKey = format(new Date(record.punch_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(record);
    return acc;
  }, {});

  /** Akta Buruh 1955 compliant work hours calculation */
  const calculateWorkHours = (dayRecords: any[]): string => {
    const sorted = [...dayRecords].sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
    let totalRaw = 0;
    let totalBreak = 0;
    let totalNormal = 0;
    let totalOT = 0;
    let lastIn: Date | null = null;

    for (const r of sorted) {
      if (r.punch_type === 'in') lastIn = new Date(r.punch_time);
      else if (r.punch_type === 'out' && lastIn) {
        const wh = calculateDailyWorkHours(lastIn, new Date(r.punch_time));
        totalRaw += wh.rawMinutes;
        totalBreak += wh.breakMinutes;
        totalNormal += wh.normalMinutes;
        totalOT += wh.overtimeMinutes;
        lastIn = null;
      }
    }

    const result = { rawMinutes: totalRaw, breakMinutes: totalBreak, netMinutes: totalNormal + totalOT, normalMinutes: totalNormal, overtimeMinutes: totalOT };
    return formatWorkHours(result);
  };

  /** Get the scheduled shift start for a record */
  const getShiftStart = (record: any): string => {
    const dateKey = format(new Date(record.punch_time), 'yyyy-MM-dd');
    const userShifts = shifts[record.user_id];
    return userShifts?.[dateKey]?.start || DEFAULT_SHIFT_START;
  };

  /** Get lateness dot color for a punch-in record */
  const getPunchDotColor = (record: any): string => {
    if (record.punch_type !== 'in') return 'bg-red-500'; // out = red dot
    const shiftStart = getShiftStart(record);
    const punchTime = new Date(record.punch_time);
    const day = new Date(record.punch_time);
    const lateMin = calculateLatenessMinutes(punchTime, shiftStart, day);
    const severity = getLatenessSeverity(lateMin);
    return getLatenessDotColor(severity);
  };

  const exportToCSV = () => {
    const sorted = [...records].sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
    const headers = isAdmin ? ['Date', 'Time', 'Type', 'Zone', 'Employee'] : ['Date', 'Time', 'Type', 'Zone'];
    const rows = sorted.map((r) => {
      const row = [format(new Date(r.punch_time), 'yyyy-MM-dd'), format(new Date(r.punch_time), 'h:mm a'), r.punch_type === 'in' ? 'In' : 'Out', r.zone_id && zones[r.zone_id] ? zones[r.zone_id].name : 'Unknown'];
      if (isAdmin) row.push(profiles[r.user_id] || 'Unknown');
      return row;
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `attendance-${format(selectedMonth, 'yyyy-MM')}.csv`; link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Attendance History</h1><p className="text-muted-foreground">{isAdmin ? 'View all staff attendance records' : 'View your past attendance records'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Employees" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Employees</SelectItem>{employeeList.map((e: any) => (<SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>))}</SelectContent>
            </Select>
          )}
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" className="w-[180px] justify-start text-left"><CalendarIcon className="mr-2 h-4 w-4" />{format(selectedMonth, 'MMMM yyyy')}</Button></PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={selectedMonth} onSelect={(d) => d && setSelectedMonth(d)} initialFocus /></PopoverContent>
          </Popover>
          <Button variant="outline" onClick={exportToCSV} disabled={records.length === 0}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Days</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{Object.keys(groupedRecords).length}</div><p className="text-xs text-muted-foreground">Days with punches</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Punches</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{records.length}</div><p className="text-xs text-muted-foreground">This month</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Punch Ins</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{records.filter(r => r.punch_type === 'in').length}</div><p className="text-xs text-muted-foreground">This month</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Daily Records</CardTitle><CardDescription>{format(selectedMonth, 'MMMM yyyy')} attendance details</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Loading records...</div>
          : Object.keys(groupedRecords).length === 0 ? <div className="text-center py-8 text-muted-foreground">No records found for this month</div>
          : (
            <div className="space-y-6">
              {Object.entries(groupedRecords).sort(([a], [b]) => b.localeCompare(a)).map(([dateKey, dayRecords]) => (
                <div key={dateKey} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-3"><h3 className="font-medium">{format(new Date(dateKey), 'EEEE, MMMM d')}</h3><span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{calculateWorkHours(dayRecords)}</span></div>
                  <div className="space-y-2">
                    {dayRecords.sort((a: any, b: any) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()).map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 text-sm">
                        <div className={cn('h-2 w-2 rounded-full', getPunchDotColor(r))} />
                        <span className="font-medium w-16">{r.punch_type === 'in' ? 'In' : 'Out'}</span>
                        <span className="text-muted-foreground">{format(new Date(r.punch_time), 'h:mm a')}</span>
                        {r.zone_id && zones[r.zone_id] && <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{zones[r.zone_id].name}</span>}
                        {isAdmin && <span className="text-muted-foreground ml-auto">{profiles[r.user_id] || 'Unknown'}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
