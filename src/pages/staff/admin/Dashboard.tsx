import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import KanbanBoard from '@/components/staff/KanbanBoard';
import DailyReportsSummary from '@/components/staff/DailyReportsSummary';
import { Users, Map, Clock, TrendingUp, Inbox, UserCheck, UserX, Stethoscope, HardHat } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay } from 'date-fns';

interface RosterCell { staffId: string; staffName: string; }
interface RosterShifts { shift1: RosterCell[]; shift2: RosterCell[]; shift3?: RosterCell[]; }
interface DutyInfo { name: string; shifts: string[]; }

export default function StaffAdminDashboard() {
  const [stats, setStats] = useState({ totalEmployees: 0, activeZones: 0, todayPunches: 0, punchedInNow: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [doctorsOnDuty, setDoctorsOnDuty] = useState<DutyInfo[]>([]);
  const [doctorsOff, setDoctorsOff] = useState<string[]>([]);
  const [staffOnDuty, setStaffOnDuty] = useState<DutyInfo[]>([]);
  const [staffOff, setStaffOff] = useState<string[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);

  useEffect(() => { fetchStats(); fetchPendingCount(); fetchTodayDuty(); }, []);

  const fetchStats = async () => {
    const { count: employeeCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: zoneCount } = await supabase.from('geofence_zones').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const today = new Date();
    const { count: punchCount } = await supabase.from('attendance_records').select('*', { count: 'exact', head: true }).gte('punch_time', startOfDay(today).toISOString()).lte('punch_time', endOfDay(today).toISOString());
    const { data: lastPunches } = await supabase.from('attendance_records').select('user_id, punch_type').gte('punch_time', startOfDay(today).toISOString()).order('punch_time', { ascending: false });
    const userLastPunch: Record<string, string> = {};
    lastPunches?.forEach((p) => { if (!userLastPunch[p.user_id]) userLastPunch[p.user_id] = p.punch_type; });
    const punchedInCount = Object.values(userLastPunch).filter(t => t === 'in').length;
    setStats({ totalEmployees: employeeCount || 0, activeZones: zoneCount || 0, todayPunches: punchCount || 0, punchedInNow: punchedInCount });
  };

  const fetchPendingCount = async () => {
    const [{ count: dc }, { count: lc }] = await Promise.all([
      supabase.from('task_delete_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setPendingCount((dc || 0) + (lc || 0));
  };

  const fetchTodayDuty = async () => {
    setRosterLoading(true);
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const month = today.getMonth();
    const year = today.getFullYear();

    const { data: rosters } = await supabase
      .from('saved_rosters')
      .select('roster_type, roster_data, staff_list')
      .eq('month', month)
      .eq('year', year)
      .in('roster_type', ['doctor', 'support']);

    if (rosters) {
      for (const roster of rosters) {
        const data = roster.roster_data as unknown as Record<string, RosterShifts>;
        const staffList = roster.staff_list as unknown as { id: string; name: string }[];
        const todayData = data?.[todayKey];

        if (!todayData || !staffList) continue;

        const assignedIds = new Set<string>();
        const onDuty: DutyInfo[] = [];

        const shiftLabels: Record<string, string> = roster.roster_type === 'doctor'
          ? { shift1: 'S1 (8am-2pm)', shift2: 'S2 (2pm-8pm)', shift3: 'S3 (8pm-12am)' }
          : { shift1: 'S1 (8am-4pm)', shift2: 'S2 (4pm-12am)' };

        const dutyMap: Record<string, string[]> = {};
        for (const [shiftKey, label] of Object.entries(shiftLabels)) {
          const rawCells = (todayData as any)[shiftKey];
          const cells: RosterCell[] | undefined = rawCells
            ? Array.isArray(rawCells) ? rawCells : [rawCells]
            : undefined;
          if (cells) {
            cells.forEach(c => {
              if (c.staffId) {
                assignedIds.add(c.staffId);
                if (!dutyMap[c.staffId]) dutyMap[c.staffId] = [];
                dutyMap[c.staffId].push(label);
              }
            });
          }
        }

        for (const [id, shifts] of Object.entries(dutyMap)) {
          const staff = staffList.find(s => s.id === id);
          if (staff) onDuty.push({ name: staff.name, shifts });
        }

        const off = staffList.filter(s => !assignedIds.has(s.id)).map(s => s.name);

        if (roster.roster_type === 'doctor') {
          setDoctorsOnDuty(onDuty);
          setDoctorsOff(off);
        } else {
          setStaffOnDuty(onDuty);
          setStaffOff(off);
        }
      }
    }
    setRosterLoading(false);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1><p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p></div>

      {/* Today's Duty Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Doctors — Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rosterLoading ? (
              <p className="text-sm text-muted-foreground">Loading roster...</p>
            ) : doctorsOnDuty.length === 0 && doctorsOff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No doctor roster published for this month.</p>
            ) : (
              <>
                {doctorsOnDuty.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-green-600" /> On Duty</p>
                    <div className="flex flex-wrap gap-1.5">
                      {doctorsOnDuty.map(d => (
                        <Badge key={d.name} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                          {d.name} <span className="ml-1 opacity-70">({d.shifts.join(', ')})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {doctorsOff.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserX className="h-3.5 w-3.5 text-red-500" /> Off Duty</p>
                    <div className="flex flex-wrap gap-1.5">
                      {doctorsOff.map(n => (
                        <Badge key={n} variant="outline" className="text-xs text-muted-foreground">{n}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><HardHat className="h-5 w-5 text-primary" /> Support Staff — Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rosterLoading ? (
              <p className="text-sm text-muted-foreground">Loading roster...</p>
            ) : staffOnDuty.length === 0 && staffOff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff roster published for this month.</p>
            ) : (
              <>
                {staffOnDuty.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-green-600" /> On Duty</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staffOnDuty.map(d => (
                        <Badge key={d.name} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                          {d.name} <span className="ml-1 opacity-70">({d.shifts.join(', ')})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {staffOff.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1"><UserX className="h-3.5 w-3.5 text-red-500" /> Off Duty</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staffOff.map(n => (
                        <Badge key={n} variant="outline" className="text-xs text-muted-foreground">{n}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Employees</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalEmployees}</div><p className="text-xs text-muted-foreground">Registered staff</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Active Zones</CardTitle><Map className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.activeZones}</div><p className="text-xs text-muted-foreground">Geofence locations</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Today's Punches</CardTitle><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.todayPunches}</div><p className="text-xs text-muted-foreground">Total punch records</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Currently In</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.punchedInNow}</div><p className="text-xs text-muted-foreground">Staff punched in now</p></CardContent></Card>
      </div>
      <DailyReportsSummary />
      <KanbanBoard />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Manage Employees</CardTitle><CardDescription>Add, edit, or remove staff</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/employees">View Employees</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" />Manage Zones</CardTitle><CardDescription>Configure geofence locations</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/zones">View Zones</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" />Requests{pendingCount > 0 && <span className="inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">{pendingCount}</span>}</CardTitle><CardDescription>Task deletions & leave requests</CardDescription></CardHeader><CardContent><Button asChild className="w-full"><Link to="/staff/admin/requests">View Requests</Link></Button></CardContent></Card>
      </div>
    </div>
  );
}