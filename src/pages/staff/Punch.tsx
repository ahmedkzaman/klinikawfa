import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, RefreshCw, CheckCircle, AlertTriangle, XCircle, CalendarClock } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/contexts/AuthContext';
import { checkGeofence, formatDistance, getAccuracyStatus } from '@/lib/geofence';
import { normalizeShiftKey } from '@/lib/rosterUtils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { resolvePunchBuffers, resolvePunchBuffersWithSource, DEFAULT_BUFFERS, type PunchBuffers, type BufferSource } from '@/hooks/useUserPunchBuffers';
import { format, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { FaceVerificationModal } from '@/components/staff/FaceVerificationModal';
import { logicalWorkDateOf } from '@/lib/attendanceUtils';

// Roster row from roster_zone_assignments
interface RosterRow {
  zone_id: string;
  start_time: string; // 'HH:mm:ss' or 'HH:mm'
  end_time: string;
  work_date: string;  // 'yyyy-MM-dd'
  shift_key: string | null;
}

// Manual recurring assignment
interface ManualAssignment {
  zone_id: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
}

type ActiveShift = {
  source: 'roster' | 'manual';
  zone_id: string;
  shiftKey: string | null;       // canonical (S1/S2/S3/Daytime/Hybrid) or null for manual
  workDate: string;              // 'yyyy-MM-dd'
  start: Date;
  end: Date;
  buffers: PunchBuffers;
  bufferSource: BufferSource;
  label: string;
};

// Build candidate roster shifts from yesterday + today rows
function pickActiveRosterShift(
  rows: RosterRow[],
  settings: any[],
  roles: string[],
  now: Date,
  todayStr: string,
): { active: ActiveShift | null; nearest: ActiveShift | null } {
  const sorted = [...rows].sort((a, b) =>
    b.work_date.localeCompare(a.work_date) ||
    b.start_time.localeCompare(a.start_time),
  );

  let nearest: ActiveShift | null = null;
  let nearestDelta = Infinity;

  for (const row of sorted) {
    const sk = row.shift_key ? normalizeShiftKey(row.shift_key) : null;
    const { buffers: bufs, source: bufSrc } = resolvePunchBuffersWithSource(settings, roles, sk);
    const start = new Date(`${row.work_date}T${row.start_time}`);
    const end = new Date(`${row.work_date}T${row.end_time}`);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);

    const winStart = new Date(start.getTime() - bufs.clock_in_early_min * 60_000);
    const winEnd = new Date(end.getTime() + bufs.clock_out_late_min * 60_000);

    const candidate: ActiveShift = {
      source: 'roster',
      zone_id: row.zone_id,
      shiftKey: sk,
      workDate: row.work_date,
      start,
      end,
      buffers: bufs,
      bufferSource: bufSrc,
      label: `${sk ?? 'Shift'} (${format(start, 'h:mm a')} – ${format(end, 'h:mm a')})${
        row.work_date !== todayStr ? ' (from yesterday)' : ''
      }`,
    };

    if (now >= winStart && now <= winEnd) {
      return { active: candidate, nearest: candidate };
    }

    const delta = Math.min(
      Math.abs(now.getTime() - winStart.getTime()),
      Math.abs(now.getTime() - winEnd.getTime()),
    );
    if (delta < nearestDelta) { nearestDelta = delta; nearest = candidate; }
  }

  return { active: null, nearest };
}

function pickActiveManualShift(
  assignments: ManualAssignment[],
  settings: any[],
  roles: string[],
  now: Date,
  todayStr: string,
): ActiveShift | null {
  const dow = now.getDay();
  // Also check yesterday's dow for cross-midnight manual shifts
  const yDow = (dow + 6) % 7;
  const yStr = format(subDays(now, 1), 'yyyy-MM-dd');
  const { buffers: bufs, source: bufSrc } = resolvePunchBuffersWithSource(settings, roles, null);

  const candidates: { date: string; dow: number; a: ManualAssignment }[] = [];
  for (const a of assignments) {
    if (!a.is_active) continue;
    if (a.days_of_week.includes(dow)) candidates.push({ date: todayStr, dow, a });
    if (a.days_of_week.includes(yDow)) candidates.push({ date: yStr, dow: yDow, a });
  }

  for (const c of candidates) {
    const start = new Date(`${c.date}T${c.a.start_time}`);
    const end = new Date(`${c.date}T${c.a.end_time}`);
    if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
    const winStart = new Date(start.getTime() - bufs.clock_in_early_min * 60_000);
    const winEnd = new Date(end.getTime() + bufs.clock_out_late_min * 60_000);
    if (now >= winStart && now <= winEnd) {
      return {
        source: 'manual',
        zone_id: c.a.zone_id,
        shiftKey: null,
        workDate: c.date,
        start,
        end,
        buffers: bufs,
        bufferSource: bufSrc,
        label: `Manual (${format(start, 'h:mm a')} – ${format(end, 'h:mm a')})`,
      };
    }
  }
  return null;
}

export default function StaffPunch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const geo = useGeolocation();
  const [zones, setZones] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [isPunching, setIsPunching] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [rosterRows, setRosterRows] = useState<RosterRow[]>([]);
  const [manualAssignments, setManualAssignments] = useState<ManualAssignment[]>([]);
  const [bufferSettings, setBufferSettings] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [now, setNow] = useState<Date>(new Date());
  const [serverSkewMs, setServerSkewMs] = useState<number | null>(null);
  const [loggedBlockKey, setLoggedBlockKey] = useState<string | null>(null);

  useEffect(() => { if (user) fetchData(); }, [user]);
  useEffect(() => { geo.getCurrentPosition(); }, []);

  // Tick every 30s so the active-shift evaluator updates near window boundaries
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // One-shot device-clock vs server-clock check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.rpc('get_server_now' as any).maybeSingle?.() ?? { data: null, error: null };
      // Fallback: use response Date header (always present)
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, { method: 'GET' });
        const dateHeader = res.headers.get('date');
        if (!cancelled && dateHeader) {
          const serverMs = new Date(dateHeader).getTime();
          const rtt = (Date.now() - t0) / 2;
          setServerSkewMs(Date.now() - rtt - serverMs);
        }
      } catch { /* ignore */ }
      // Suppress unused warnings
      void data; void error;
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchData = async () => {
    setIsLoadingData(true);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');

    const [zonesRes, punchRes, manualRes, rosterRes, settingsRes, rolesRes] = await Promise.all([
      supabase.from('geofence_zones').select('id, name, latitude, longitude, radius_meters').eq('is_active', true),
      supabase.from('attendance_records').select('punch_type, punch_time, logical_work_date, shift_key').eq('user_id', user?.id).order('punch_time', { ascending: false }).limit(20),
      supabase.from('staff_zone_assignments').select('zone_id, start_time, end_time, days_of_week, is_active').eq('user_id', user?.id).eq('is_active', true),
      supabase.from('roster_zone_assignments').select('zone_id, start_time, end_time, work_date, shift_key').eq('user_id', user?.id).in('work_date', [yesterdayStr, todayStr, tomorrowStr]),
      supabase.from('punch_buffer_settings').select('*'),
      supabase.from('user_roles').select('role').eq('user_id', user?.id),
    ]);

    if (zonesRes.data) setZones(zonesRes.data);
    setAttendanceRecords(punchRes.data ?? []);
    setRosterRows((rosterRes.data ?? []) as RosterRow[]);
    setManualAssignments((manualRes.data ?? []) as ManualAssignment[]);
    setBufferSettings(settingsRes.data ?? []);
    setUserRoles((rolesRes.data ?? []).map((r: any) => r.role as string));
    setIsLoadingData(false);
  };

  const todayStr = format(now, 'yyyy-MM-dd');

  const { activeShift, nearestShift } = useMemo(() => {
    const { active, nearest } = pickActiveRosterShift(rosterRows, bufferSettings, userRoles, now, todayStr);
    if (active) return { activeShift: active, nearestShift: nearest };

    // Roster should take priority for the current work day. However, stale
    // yesterday/tomorrow roster rows must not block a valid manual assignment
    // for staff who are not rostered today.
    const hasTodayRoster = rosterRows.some((row) => row.work_date === todayStr);
    if (!hasTodayRoster) {
      const manual = pickActiveManualShift(manualAssignments, bufferSettings, userRoles, now, todayStr);
      return { activeShift: manual, nearestShift: nearest };
    }

    return { activeShift: null, nearestShift: nearest };
  }, [rosterRows, manualAssignments, bufferSettings, userRoles, now, todayStr]);

  const buffers = activeShift?.buffers ?? nearestShift?.buffers ?? resolvePunchBuffers(bufferSettings, userRoles, null) ?? DEFAULT_BUFFERS;

  const geofenceResult = geo.latitude && geo.longitude && zones.length > 0
    ? checkGeofence({ latitude: geo.latitude, longitude: geo.longitude }, zones) : null;
  const accuracyStatus = geo.accuracy ? getAccuracyStatus(geo.accuracy) : null;
  const activeWorkDate = activeShift?.workDate ?? todayStr;
  const lastPunch = attendanceRecords.find((record) => logicalWorkDateOf(record) === activeWorkDate) ?? null;
  const lastAnyPunch = attendanceRecords[0] ?? null;
  const isPunchedIn = lastPunch?.punch_type === 'in';
  const nextPunchType: 'in' | 'out' = isPunchedIn ? 'out' : 'in';

  // Build the unified guard message
  const fmtTime = (d: Date) => format(d, 'h:mm a');
  const guardMessage: string | null = useMemo(() => {
    if (!geofenceResult?.isWithinZone) return null; // zone error handled separately
    const hasAnyAssignment = rosterRows.length > 0 || manualAssignments.length > 0;
    if (!hasAnyAssignment) return null; // no roster + no manual: allow (legacy fallback)

    if (!activeShift) {
      if (nearestShift) {
        const winStart = new Date(nearestShift.start.getTime() - nearestShift.buffers.clock_in_early_min * 60_000);
        const winEnd = new Date(nearestShift.end.getTime() + nearestShift.buffers.clock_out_late_min * 60_000);
        return `Outside your shift window. Nearest: ${nearestShift.label}. Punch open ${fmtTime(winStart)} – ${fmtTime(winEnd)}.`;
      }
      return 'You are not scheduled to work near this time.';
    }
    if (activeShift.zone_id !== geofenceResult.zone?.id) {
      return 'You are not assigned to this zone.';
    }
    // Asymmetric in/out window check inside the active shift
    if (nextPunchType === 'in') {
      const closeAt = new Date(activeShift.start.getTime() + buffers.clock_in_late_min * 60_000);
      if (now > closeAt) {
        console.warn('Blocked late punch-in attempt', { userId: user?.id, shift: activeShift.shiftKey, time: now });
        return 'Punch-in window has closed. Please ask the administrator to record a manual entry.';
      }
    } else {
      const openAt = new Date(activeShift.end.getTime() - buffers.clock_out_early_min * 60_000);
      if (now < openAt) return `Punch-out opens at ${fmtTime(openAt)} (${buffers.clock_out_early_min} min before shift end).`;
    }
    return null;
  }, [activeShift, nearestShift, geofenceResult, nextPunchType, buffers, now, rosterRows.length, manualAssignments.length]);

  const handlePunchClick = () => {
    if (!geo.latitude || !geo.longitude || !geofenceResult?.isWithinZone) {
      toast({ title: 'Cannot Punch', description: 'You must be within a valid zone.', variant: 'destructive' });
      return;
    }
    if (guardMessage) {
      toast({ title: 'Cannot Punch', description: guardMessage, variant: 'destructive' });
      return;
    }
    setShowFaceVerification(true);
  };

  const handleFaceVerified = async () => {
    setIsPunching(true);
    const { error } = await supabase.from('attendance_records').insert({
      user_id: user?.id,
      punch_type: nextPunchType,
      latitude: geo.latitude!,
      longitude: geo.longitude!,
      accuracy_meters: geo.accuracy,
      zone_id: geofenceResult?.zone?.id,
      face_verified: true,
      // Hard-link the logical shift this punch belongs to so reports
      // remain stable even if buffer settings change later.
      logical_work_date: activeShift?.workDate ?? todayStr,
      shift_key: activeShift?.shiftKey ?? null,
    } as any);
    if (error) {
      console.error('Punch insert failed:', error);
      toast({ title: 'Punch Failed', description: error.message || 'Error recording punch.', variant: 'destructive' });
    } else {
      toast({
        title: nextPunchType === 'in' ? 'Punched In!' : 'Punched Out!',
        description: `Recorded at ${geofenceResult?.zone?.name}`,
      });
      setAttendanceRecords((records) => [{
        punch_type: nextPunchType,
        punch_time: new Date().toISOString(),
        logical_work_date: activeShift?.workDate ?? todayStr,
        shift_key: activeShift?.shiftKey ?? null,
      }, ...records]);
    }
    setIsPunching(false);
  };

  const canPunch = geofenceResult?.isWithinZone && !guardMessage && !geo.isLoading && !isPunching;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Punch In/Out</h1>
        <p className="text-muted-foreground">Record your attendance using GPS verification</p>
      </div>

      {/* Active Shift Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />Active Shift
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingData ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Loading roster...
            </div>
          ) : activeShift ? (
            <div className="flex items-center gap-2 flex-wrap">
              {activeShift.shiftKey && <Badge variant="secondary" className="text-sm">{activeShift.shiftKey}</Badge>}
              <span className="text-sm font-medium">{activeShift.label}</span>
              {activeShift.workDate !== todayStr && (
                <Badge variant="outline" className="text-xs">cross-midnight</Badge>
              )}
            </div>
          ) : nearestShift ? (
            <p className="text-sm text-muted-foreground">
              No shift active right now. Nearest: <span className="font-medium text-foreground">{nearestShift.label}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No shift assigned (roster not found)</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Location Status</CardTitle>
          <CardDescription>Your current GPS position and zone verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {geo.isLoading && <div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /><span>Getting your location...</span></div>}
          {geo.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{geo.error}</AlertDescription></Alert>}
          {geo.latitude && geo.longitude && !geo.isLoading && (
            <div className="space-y-3">
              {accuracyStatus && (
                <div className={cn('flex items-center gap-2 text-sm', accuracyStatus.status === 'good' && 'text-green-600', accuracyStatus.status === 'fair' && 'text-yellow-600', accuracyStatus.status === 'poor' && 'text-red-600')}>
                  {accuracyStatus.status === 'good' && <CheckCircle className="h-4 w-4" />}{accuracyStatus.status === 'fair' && <AlertTriangle className="h-4 w-4" />}{accuracyStatus.status === 'poor' && <XCircle className="h-4 w-4" />}
                  <span>{accuracyStatus.message} ({Math.round(geo.accuracy!)}m)</span>
                </div>
              )}
              {geofenceResult && (
                <div className={cn('p-4 rounded-lg border', geofenceResult.isWithinZone ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800')}>
                  {geofenceResult.isWithinZone ? (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400"><CheckCircle className="h-5 w-5" /><div><p className="font-medium">Inside Zone</p><p className="text-sm opacity-80">{geofenceResult.zone?.name}</p></div></div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400"><XCircle className="h-5 w-5" /><div><p className="font-medium">Outside Zone</p><p className="text-sm opacity-80">Nearest: {geofenceResult.nearestZone?.name} ({formatDistance(geofenceResult.distance)} away)</p></div></div>
                  )}
                </div>
              )}
              {guardMessage && geofenceResult?.isWithinZone && (
                <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{guardMessage}</AlertDescription></Alert>
              )}
              <Button variant="outline" size="sm" onClick={geo.getCurrentPosition} disabled={geo.isLoading}>
                <RefreshCw className={cn('h-4 w-4 mr-2', geo.isLoading && 'animate-spin')} />Refresh Location
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record Attendance</CardTitle>
          {lastAnyPunch && <CardDescription>Last punch: {lastAnyPunch.punch_type === 'in' ? 'In' : 'Out'} at {format(new Date(lastAnyPunch.punch_time), 'h:mm a, MMM d')}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Button size="lg" className={cn('w-full h-20 text-lg', nextPunchType === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700')} disabled={!canPunch || isLoadingData} onClick={handlePunchClick}>
            {isPunching ? <><Loader2 className="h-6 w-6 mr-2 animate-spin" />Recording...</> : <><MapPin className="h-6 w-6 mr-2" />Punch {nextPunchType === 'in' ? 'In' : 'Out'}</>}
          </Button>
          <FaceVerificationModal open={showFaceVerification} onOpenChange={setShowFaceVerification} onVerified={handleFaceVerified} punchType={nextPunchType} />
          {!canPunch && !geo.isLoading && !isLoadingData && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              {guardMessage || (!geo.latitude ? 'Enable location access to punch' : 'Move to an allowed zone to punch')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
