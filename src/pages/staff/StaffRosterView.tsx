import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getISOWeek, isWeekend } from 'date-fns';
import { cn } from '@/lib/utils';

interface StaffMember { id: string; name: string; position: string; }
interface RosterCell { staffId: string; staffName: string; }
interface RosterData { [dateKey: string]: { shift1: RosterCell[]; shift2: RosterCell[] }; }

const SHIFT_HOURS = 8;
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function firstName(name: string) { return name.split(' ')[0]; }

export default function StaffRosterView() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const monthDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    return eachDayOfInterval({ start, end: endOfMonth(start) });
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('saved_rosters')
        .select('*')
        .eq('roster_type', 'support')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle();
      if (data) {
        setRoster(data.roster_data as unknown as RosterData);
        setStaffList((data.staff_list as unknown as StaffMember[]) || []);
        setSavedAt(data.updated_at);
      } else {
        setRoster(null);
        setStaffList([]);
        setSavedAt(null);
      }
      setLoading(false);
    };
    load();
  }, [selectedMonth, selectedYear]);

  const prevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const summary = useMemo(() => {
    if (!roster || staffList.length === 0) return [];
    const hours: Record<string, number> = {};
    const shifts: Record<string, number> = {};
    staffList.forEach(s => { hours[s.id] = 0; shifts[s.id] = 0; });
    for (const dk of Object.keys(roster)) {
      const r = roster[dk];
      [...r.shift1, ...r.shift2].forEach(c => {
        if (c.staffId) {
          hours[c.staffId] = (hours[c.staffId] || 0) + SHIFT_HOURS;
          shifts[c.staffId] = (shifts[c.staffId] || 0) + 1;
        }
      });
    }
    return staffList.map(s => ({
      name: s.name,
      totalShifts: shifts[s.id] || 0,
      totalHours: hours[s.id] || 0,
      isOvertime: (hours[s.id] || 0) > 48 * Math.ceil(monthDays.length / 7),
    }));
  }, [roster, staffList, monthDays]);

  const fairnessMetrics = useMemo(() => {
    if (summary.length === 0) return null;
    const hours = summary.map(s => s.totalHours);
    const maxH = Math.max(...hours);
    const minH = Math.min(...hours);
    const spread = maxH - minH;
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const score = avg > 0 ? Math.max(0, Math.min(100, Math.round(100 - (spread / avg) * 100))) : 100;
    return { maxH, minH, spread, avg: Math.round(avg), score };
  }, [summary]);

  const monthLabel = format(new Date(selectedYear, selectedMonth, 1), 'MMMM yyyy');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Staff Roster</h1>
          <p className="text-sm text-muted-foreground">View the published monthly support staff roster</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">Roster — {monthLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-center cursor-default">
                <CalendarDays className="h-4 w-4" />{monthLabel}
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          {savedAt && <p className="text-xs text-muted-foreground mt-1">Last updated: {format(new Date(savedAt), 'dd MMM yyyy, HH:mm')}</p>}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : roster ? (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32 sticky left-0 bg-background z-10 text-center text-xs font-semibold">Week</TableHead>
                      {(() => {
                        const groups: { week: number; span: number }[] = [];
                        monthDays.forEach(day => {
                          const w = getISOWeek(day);
                          if (groups.length > 0 && groups[groups.length - 1].week === w) groups[groups.length - 1].span++;
                          else groups.push({ week: w, span: 1 });
                        });
                        return groups.map((g, i) => (
                          <TableHead key={g.week} colSpan={g.span} className={cn("text-center text-xs font-semibold border-x", i % 2 === 0 ? "bg-primary/10" : "bg-accent/30")}>
                            Week {g.week}
                          </TableHead>
                        ));
                      })()}
                    </TableRow>
                    <TableRow>
                      <TableHead className="w-32 font-semibold sticky left-0 bg-background z-10">Shift</TableHead>
                      {monthDays.map(day => (
                        <TableHead key={day.toISOString()} className={cn("text-center min-w-[70px]", isWeekend(day) && "bg-muted/30")}>
                          <div className="font-semibold text-xs">{DAY_ABBR[getDay(day)]}</div>
                          <div className="text-xs text-muted-foreground font-normal">{format(day, 'd')}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Shift 1 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 1</div>
                        <div className="text-[10px] text-muted-foreground">8am–4pm</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const cells = roster[dk]?.shift1 || [];
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[11px]", isWeekend(day) && "bg-muted/20")}>
                            {cells.length > 0 ? cells.map(c => firstName(c.staffName)).join(', ') : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Shift 2 */}
                    <TableRow>
                      <TableCell className="font-medium bg-muted/30 sticky left-0 z-10">
                        <div className="text-xs">Shift 2</div>
                        <div className="text-[10px] text-muted-foreground">4pm–12am</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const cells = roster[dk]?.shift2 || [];
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[11px]", isWeekend(day) && "bg-muted/20")}>
                            {cells.length > 0 ? cells.map(c => firstName(c.staffName)).join(', ') : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {/* Off row */}
                    <TableRow>
                      <TableCell className="font-medium bg-destructive/10 sticky left-0 z-10">
                        <div className="text-xs">Off</div>
                      </TableCell>
                      {monthDays.map(day => {
                        const dk = format(day, 'yyyy-MM-dd');
                        const r = roster[dk];
                        const assigned = new Set<string>();
                        if (r) {
                          [...r.shift1, ...r.shift2].forEach(c => assigned.add(c.staffId));
                        }
                        const off = staffList.filter(s => !assigned.has(s.id));
                        return (
                          <TableCell key={dk} className={cn("text-center p-1 text-[10px] text-muted-foreground", isWeekend(day) && "bg-muted/20")}>
                            {off.length > 0 ? off.map(s => firstName(s.name)).join(', ') : '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              {summary.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Monthly Summary</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-center">Total Shifts</TableHead>
                        <TableHead className="text-center">Total Hours</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.map(s => (
                        <TableRow key={s.name}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-center">{s.totalShifts}</TableCell>
                          <TableCell className="text-center">{s.totalHours}h</TableCell>
                          <TableCell className="text-center">
                            {s.isOvertime ? <Badge variant="destructive" className="text-xs">Overtime</Badge> : <Badge variant="secondary" className="text-xs">Normal</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {fairnessMetrics && (
                    <div className="flex flex-wrap items-center gap-3 mt-3 p-3 rounded-lg bg-muted/50">
                      <span className="text-sm font-medium">Fairness:</span>
                      <Badge
                        variant={fairnessMetrics.score >= 90 ? 'secondary' : 'destructive'}
                        className={cn("text-xs",
                          fairnessMetrics.score >= 90 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                          fairnessMetrics.score >= 70 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : ""
                        )}
                      >
                        {fairnessMetrics.score}% balanced
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Spread: {fairnessMetrics.maxH}h − {fairnessMetrics.minH}h = {fairnessMetrics.spread}h · Avg: {fairnessMetrics.avg}h
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No roster has been published for {monthLabel} yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
