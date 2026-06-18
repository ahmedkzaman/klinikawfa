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
    const month = today.getMonth() + 1;
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
          ? {
              DOC_S1: 'S1 (8am-1pm)', DOC_S2: 'S2 (2pm-7pm)', DOC_S3: 'S3 (8pm-12am)',
              // Back-compat with older saved rosters
              shift1: 'S1 (8am-1pm)', shift2: 'S2 (2pm-7pm)', shift3: 'S3 (8pm-12am)',
            }
          : {
              shift1: 'S1 (8am-4pm)', shift2: 'S2 (4pm-12am)', shift3: 'S3 (8pm-12am)',
              S1: 'S1 (8am-4pm)', S2: 'S2 (4pm-12am)', S3: 'S3 (8pm-12am)',
            };

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

  const bentoCard = "bg-white border-none rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

  return (
    <div className="min-h-full bg-slate-50 -m-6 p-6 md:p-8">
      <div className="space-y-6 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>

        {/* Today's Duty Status */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className={bentoCard}>
            <CardHeader className="pb-2 p-5">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5" />
                </div>
                Doctors — Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              {rosterLoading ? (
                <p className="text-sm text-slate-400">Loading roster...</p>
              ) : doctorsOnDuty.length === 0 && doctorsOff.length === 0 ? (
                <p className="text-sm text-slate-400">No doctor roster published for this month.</p>
              ) : (
                <>
                  {doctorsOnDuty.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> On Duty</p>
                      <div className="flex flex-wrap gap-1.5">
                        {doctorsOnDuty.map(d => (
                          <Badge key={d.name} variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700 border-none text-xs">
                            {d.name} <span className="ml-1 opacity-70">({d.shifts.join(', ')})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {doctorsOff.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><UserX className="h-3.5 w-3.5 text-slate-400" /> Off Duty</p>
                      <div className="flex flex-wrap gap-1.5">
                        {doctorsOff.map(n => (
                          <Badge key={n} className="rounded-full bg-slate-50 text-slate-500 border-none text-xs">{n}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className={bentoCard}>
            <CardHeader className="pb-2 p-5">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <HardHat className="h-5 w-5" />
                </div>
                Support Staff — Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0">
              {rosterLoading ? (
                <p className="text-sm text-slate-400">Loading roster...</p>
              ) : staffOnDuty.length === 0 && staffOff.length === 0 ? (
                <p className="text-sm text-slate-400">No staff roster published for this month.</p>
              ) : (
                <>
                  {staffOnDuty.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> On Duty</p>
                      <div className="flex flex-wrap gap-1.5">
                        {staffOnDuty.map(d => (
                          <Badge key={d.name} variant="secondary" className="rounded-full bg-emerald-50 text-emerald-700 border-none text-xs">
                            {d.name} <span className="ml-1 opacity-70">({d.shifts.join(', ')})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {staffOff.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><UserX className="h-3.5 w-3.5 text-slate-400" /> Off Duty</p>
                      <div className="flex flex-wrap gap-1.5">
                        {staffOff.map(n => (
                          <Badge key={n} className="rounded-full bg-slate-50 text-slate-500 border-none text-xs">{n}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-slate-800">{stats.totalEmployees}</div>
                <p className="text-sm font-medium text-slate-500 mt-1">Total Employees</p>
              </div>
            </CardContent>
          </Card>
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Map className="h-6 w-6" />
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-slate-800">{stats.activeZones}</div>
                <p className="text-sm font-medium text-slate-500 mt-1">Active Zones</p>
              </div>
            </CardContent>
          </Card>
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="h-6 w-6" />
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-slate-800">{stats.todayPunches}</div>
                <p className="text-sm font-medium text-slate-500 mt-1">Today's Punches</p>
              </div>
            </CardContent>
          </Card>
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="h-12 w-12 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="mt-4">
                <div className="text-3xl font-bold text-slate-800">{stats.punchedInNow}</div>
                <p className="text-sm font-medium text-slate-500 mt-1">Currently In</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className={`${bentoCard} p-5`}>
          <DailyReportsSummary />
        </div>
        <div className={`${bentoCard} p-5`}>
          <KanbanBoard />
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Manage Employees</h3>
                  <p className="text-sm text-slate-500">Add, edit, or remove staff</p>
                </div>
              </div>
              <Button asChild className="w-full mt-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                <Link to="/staff/admin/employees">View Employees</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Map className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Manage Zones</h3>
                  <p className="text-sm text-slate-500">Configure geofence locations</p>
                </div>
              </div>
              <Button asChild className="w-full mt-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                <Link to="/staff/admin/zones">View Zones</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className={bentoCard}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Inbox className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    Requests
                    {pendingCount > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-semibold px-2 py-0.5 ml-auto">{pendingCount}</span>
                    )}
                  </h3>
                  <p className="text-sm text-slate-500">Task deletions & leave requests</p>
                </div>
              </div>
              <Button asChild className="w-full mt-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                <Link to="/staff/admin/requests">View Requests</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}