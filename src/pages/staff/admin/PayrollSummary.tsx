import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, Search, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { eachDayOfInterval, startOfMonth, endOfMonth, format } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-blue-100 text-blue-800',
};

type PayrollSummaryRow = {
  id: string;
  user_id: string;
  month: number;
  year: number;
  total_scheduled_days: number;
  total_present_days: number;
  total_leave_days: number;
  total_absent_days: number;
  total_late_incidents: number;
  total_worked_hours: number;
  total_overtime_hours: number;
  total_payable_regular_hours: number;
  total_payable_overtime_hours: number;
  unpaid_leave_count: number;
  unpaid_leave_deduction: number;
  lateness_deduction: number;
  absence_deduction: number;
  total_allowances: number;
  total_deductions: number;
  gross_pay: number;
  net_pay: number;
  payroll_status: string;
};

export default function PayrollSummary() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: summaries, isLoading } = useQuery({
    queryKey: ['payroll-summaries', month, year],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('monthly_payroll_summaries')
        .select('*')
        .eq('month', month)
        .eq('year', year);
      if (error) throw error;
      return (data || []) as PayrollSummaryRow[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, department, position');
      return data || [];
    },
  });

  const { data: payrollProfiles } = useQuery({
    queryKey: ['payroll-profiles-all'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('staff_payroll_profiles')
        .select('*');
      return (data || []) as any[];
    },
  });

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const payrollMap = Object.fromEntries((payrollProfiles || []).map((p: any) => [p.user_id, p]));

  const enriched = (summaries || []).map(s => {
    const pp = payrollMap[s.user_id];
    const employerCost =
      (Number(pp?.epf_employer) || 0) +
      (Number(pp?.socso_employer) || 0) +
      (Number(pp?.eis_employer) || 0) +
      (Number(pp?.hrdf) || 0);
    return {
      ...s,
      name: profileMap[s.user_id]?.full_name || 'Unknown',
      department: profileMap[s.user_id]?.department || '-',
      employment_type: pp?.employment_type || '-',
      employer_cost: employerCost,
    };
  });

  const filtered = enriched.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.department.toLowerCase().includes(search.toLowerCase())
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // --- Generate Summary Mutation ---
  const generateMutation = useMutation({
    mutationFn: async () => {
      // 1. Get all active payroll profiles
      const { data: allPayroll, error: ppErr } = await (supabase as any)
        .from('staff_payroll_profiles')
        .select('*')
        .eq('payroll_status', 'active');
      if (ppErr) throw ppErr;
      if (!allPayroll || allPayroll.length === 0) throw new Error('No active payroll profiles found');

      const userIds = allPayroll.map((p: any) => p.user_id);

      // 2. Get attendance_payroll_records for this month
      const monthStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

      const { data: attendanceRecords } = await (supabase as any)
        .from('attendance_payroll_records')
        .select('*')
        .in('user_id', userIds)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      // 3. Get approved leave requests overlapping this month
      const { data: leaveRecords } = await supabase
        .from('leave_requests')
        .select('*')
        .in('user_id', userIds)
        .eq('status', 'approved')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart);

      // 4. Get rosters for scheduled days
      const { data: rosters } = await supabase
        .from('saved_rosters')
        .select('roster_data, staff_list, roster_type')
        .eq('month', month)
        .eq('year', year);

      // 5. Check existing locked/paid summaries to skip
      const { data: existingSummaries } = await (supabase as any)
        .from('monthly_payroll_summaries')
        .select('user_id, payroll_status')
        .eq('month', month)
        .eq('year', year)
        .in('payroll_status', ['paid']);

      const lockedUsers = new Set((existingSummaries || []).map((s: any) => s.user_id));

      // Build attendance map: user_id -> records[]
      const attendanceByUser: Record<string, any[]> = {};
      for (const r of (attendanceRecords || [])) {
        if (!attendanceByUser[r.user_id]) attendanceByUser[r.user_id] = [];
        attendanceByUser[r.user_id].push(r);
      }

      // Build scheduled days from roster
      const scheduledDaysByUser: Record<string, number> = {};
      if (rosters && rosters.length > 0) {
        for (const roster of rosters) {
          const rosterData = roster.roster_data as Record<string, any>;
          const staffList = roster.staff_list as any[];
          if (!rosterData || !staffList) continue;

          for (const staff of staffList) {
            const userId = staff.staffId;
            if (!userId) continue;

            for (const [dayKey, dayData] of Object.entries(rosterData)) {
              if (!dayData || typeof dayData !== 'object') continue;
              for (const [, cellData] of Object.entries(dayData as Record<string, any>)) {
                if (!cellData) continue;
                const cells = Array.isArray(cellData) ? cellData : [cellData];
                if (cells.some((c: any) => c.staffId === userId)) {
                  scheduledDaysByUser[userId] = (scheduledDaysByUser[userId] || 0) + 1;
                  break; // count each day only once per user
                }
              }
            }
          }
        }
      }

      // Count leave days per user in this month
      const leaveDaysByUser: Record<string, { total: number; unpaid: number }> = {};
      const monthDays = eachDayOfInterval({
        start: startOfMonth(new Date(year, month - 1)),
        end: endOfMonth(new Date(year, month - 1)),
      });

      for (const lr of (leaveRecords || [])) {
        const userId = lr.user_id;
        if (!leaveDaysByUser[userId]) leaveDaysByUser[userId] = { total: 0, unpaid: 0 };

        const leaveStart = new Date(lr.start_date);
        const leaveEnd = new Date(lr.end_date);
        const isUnpaid = lr.leave_type === 'unpaid';

        for (const day of monthDays) {
          if (day >= leaveStart && day <= leaveEnd) {
            leaveDaysByUser[userId].total += 1;
            if (isUnpaid) leaveDaysByUser[userId].unpaid += 1;
          }
        }
      }

      // 6. Build summaries
      const summariesToUpsert = [];
      let skipped = 0;

      for (const pp of allPayroll) {
        if (lockedUsers.has(pp.user_id)) {
          skipped++;
          continue;
        }

        const records = attendanceByUser[pp.user_id] || [];
        const leave = leaveDaysByUser[pp.user_id] || { total: 0, unpaid: 0 };

        // Fallback scheduled days: weekdays in month if no roster
        const totalDaysInMonth = monthDays.length;
        const weekdaysInMonth = monthDays.filter(d => d.getDay() !== 0 && d.getDay() !== 6).length;
        const scheduledDays = scheduledDaysByUser[pp.user_id] || weekdaysInMonth;

        const presentRecords = records.filter((r: any) => r.working_status === 'present');
        const absentRecords = records.filter((r: any) => r.working_status === 'absent');
        const lateRecords = records.filter((r: any) => (r.late_minutes || 0) > 0);

        const totalPresentDays = presentRecords.length;
        const totalAbsentDays = absentRecords.length;
        const totalLateIncidents = lateRecords.length;

        const totalWorkedHours = records.reduce((sum: number, r: any) => sum + (Number(r.total_worked_hours) || 0), 0);
        const totalOvertimeHours = records.reduce((sum: number, r: any) => sum + (Number(r.overtime_hours) || 0), 0);
        const approvedOTHours = records.reduce((sum: number, r: any) => sum + (Number(r.approved_overtime_hours) || 0), 0);

        // Employment Act 1955 calculations
        const basicSalary = Number(pp.basic_salary) || 0;
        const dailyRate = scheduledDays > 0 ? basicSalary / scheduledDays : 0;

        // Allowances (legacy + new named)
        const totalAllowances =
          (Number(pp.fixed_allowance) || 0) +
          (Number(pp.transport_allowance) || 0) +
          (Number(pp.meal_allowance) || 0) +
          (Number(pp.oncall_allowance) || 0) +
          (Number(pp.custom_allowance) || 0) +
          (Number(pp.apc_allowance) || 0) +
          (Number(pp.telephone_allowance) || 0) +
          (Number(pp.team_leader_allowance) || 0) +
          (Number(pp.project_allowance) || 0) +
          (Number(pp.admin_allowance) || 0) +
          (Number(pp.other_allowance_amount) || 0);

        // OT pay
        const otRate = Number(pp.overtime_rate) || 0;
        const otPay = approvedOTHours * otRate;

        // Gross
        const grossPay = basicSalary + totalAllowances + otPay;

        // Operational Deductions
        const unpaidLeaveDeduction = leave.unpaid * dailyRate;
        const latenessDeduction = totalLateIncidents * (Number(pp.lateness_deduction) || 0);
        const absenceDeduction = totalAbsentDays * (Number(pp.absence_deduction) || dailyRate);
        const customDeduction = Number(pp.custom_deduction) || 0;

        // Statutory Deductions (employee portion only — deducted from employee net pay)
        const epfEmployee = Number(pp.epf_employee) || 0;
        const socsoEmployee = Number(pp.socso_employee) || 0;
        const eisEmployee = Number(pp.eis_employee) || 0;
        const mtd = Number(pp.mtd) || 0;

        // Employer contributions are NOT deducted from employee pay — they are employer expenses
        // epf_employer, socso_employer, eis_employer, hrdf are excluded from totalDeductions

        const totalDeductions = unpaidLeaveDeduction + latenessDeduction + absenceDeduction + customDeduction + epfEmployee + socsoEmployee + eisEmployee + mtd;

        // Net
        const netPay = grossPay - totalDeductions;

        // Normal hours capped at 8h/day per Employment Act
        const totalPayableRegularHours = Math.min(totalWorkedHours, totalPresentDays * 8);
        const totalPayableOTHours = approvedOTHours;

        summariesToUpsert.push({
          user_id: pp.user_id,
          month,
          year,
          total_scheduled_days: scheduledDays,
          total_present_days: totalPresentDays,
          total_leave_days: leave.total,
          total_absent_days: totalAbsentDays,
          total_late_incidents: totalLateIncidents,
          total_worked_hours: Math.round(totalWorkedHours * 100) / 100,
          total_overtime_hours: Math.round(totalOvertimeHours * 100) / 100,
          total_payable_regular_hours: Math.round(totalPayableRegularHours * 100) / 100,
          total_payable_overtime_hours: Math.round(totalPayableOTHours * 100) / 100,
          unpaid_leave_count: leave.unpaid,
          unpaid_leave_deduction: Math.round(unpaidLeaveDeduction * 100) / 100,
          lateness_deduction: Math.round(latenessDeduction * 100) / 100,
          absence_deduction: Math.round(absenceDeduction * 100) / 100,
          total_allowances: Math.round(totalAllowances * 100) / 100,
          total_deductions: Math.round(totalDeductions * 100) / 100,
          gross_pay: Math.round(grossPay * 100) / 100,
          net_pay: Math.round(netPay * 100) / 100,
          payroll_status: 'draft',
        });
      }

      if (summariesToUpsert.length === 0) {
        return { generated: 0, skipped };
      }

      // Upsert with conflict on (user_id, month, year)
      const { error: upsertErr } = await (supabase as any)
        .from('monthly_payroll_summaries')
        .upsert(summariesToUpsert, { onConflict: 'user_id,month,year', ignoreDuplicates: false });
      if (upsertErr) throw upsertErr;

      return { generated: summariesToUpsert.length, skipped };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-summaries', month, year] });
      toast({
        title: 'Payroll summaries generated',
        description: `${result.generated} summaries created/updated${result.skipped > 0 ? `, ${result.skipped} skipped (paid)` : ''}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Generation failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Payroll Summary</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              variant="default"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
              {generateMutation.isPending ? 'Generating...' : 'Generate Summary'}
            </Button>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff or department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground">No payroll data for {MONTHS[month - 1]} {year}</p>
              <p className="text-sm text-muted-foreground">Click "Generate Summary" to create payroll summaries from attendance and roster data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Dept</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">Leave</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead className="text-center">Late</TableHead>
                    <TableHead className="text-center">OT Hrs</TableHead>
                    <TableHead className="text-center">Unpaid Leave</TableHead>
                    <TableHead className="text-right">Gross (RM)</TableHead>
                    <TableHead className="text-right">Deductions (RM)</TableHead>
                    <TableHead className="text-right">Net (RM)</TableHead>
                    <TableHead className="text-right">Employer Cost (RM)</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Indicators</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.department}</TableCell>
                      <TableCell className="text-center">{s.total_present_days}</TableCell>
                      <TableCell className="text-center">{s.total_leave_days}</TableCell>
                      <TableCell className="text-center">{s.total_absent_days}</TableCell>
                      <TableCell className="text-center">{s.total_late_incidents}</TableCell>
                      <TableCell className="text-center">{s.total_overtime_hours}</TableCell>
                      <TableCell className="text-center">{s.unpaid_leave_count}</TableCell>
                      <TableCell className="text-right">{Number(s.gross_pay).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{Number(s.total_deductions).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(s.net_pay).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{s.employer_cost.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusColors[s.payroll_status] || ''}>
                          {s.payroll_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(s.unpaid_leave_count > 0 || s.total_absent_days > 0 || s.total_late_incidents > 0) && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
