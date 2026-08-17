import { format } from 'date-fns';

import { useAttendanceHeatmap } from '@/hooks/clinic/useAttendanceHeatmap';
import { useClinicHealth } from '@/hooks/clinic/useClinicHealth';
import { useFinancialControlSummary } from '@/hooks/clinic/useFinancialControl';
import {
  attendanceAverageWaiting,
  buildAttendanceSummary,
} from '@/lib/clinic/insight/commandCentre';
import { evaluateDataConfidence } from '@/lib/clinic/insight/dataConfidence';
import { CommandCentreTab } from './command/CommandCentreTab';
import { InsightState } from './shared/InsightState';

export function ClinicHealthTab({
  startDate,
  endDate,
  enabled = true,
}: {
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
}) {
  const startKey = format(startDate, 'yyyy-MM-dd');
  const endKey = format(endDate, 'yyyy-MM-dd');
  const clinic = useClinicHealth(startDate, endDate, { enabled });
  const financial = useFinancialControlSummary({ from: startDate, to: endDate }, { enabled });
  const attendance = useAttendanceHeatmap({
    startDate: enabled ? startKey : '',
    endDate: enabled ? endKey : '',
    doctorId: null,
    permissionDomain: 'insight',
  });

  if (clinic.isLoading && !clinic.data) {
    return <InsightState state="loading" label="Loading Command Centre…" />;
  }
  if (clinic.isError && !clinic.data) {
    return (
      <InsightState
        state="error"
        label="Command Centre"
        error={clinic.error}
        onRetry={() => { void clinic.refetch(); }}
        retryLabel="Retry Command Centre"
      />
    );
  }
  if (!clinic.data) {
    return <InsightState state="empty" label="No Command Centre data is available for this period." />;
  }

  const attendanceCells = attendance.data?.cells ?? [];
  const attendanceConfidence = evaluateDataConfidence({
    expectedRows: attendance.data || attendance.isError ? 112 : null,
    observedRows: attendanceCells.length,
    missingAttributionRows: attendanceCells.filter((cell) => cell.coverage !== 'complete').length,
    lastRefreshedAt: attendance.dataUpdatedAt > 0 ? new Date(attendance.dataUpdatedAt) : null,
    source: 'clinical-attendance-heatmap',
    dateBasis: 'Queue arrival hour in Asia/Kuala_Lumpur',
    sourceFailed: attendance.isError,
  });
  const financialIncomplete = Boolean(financial.data && (
    !financial.data.period.attributionComplete || !financial.data.period.costComplete
  ));
  const clinicDataQuality = clinic.data.metrics.dataQuality;
  const clinicIncomplete = clinicDataQuality.completedWithoutPayment > 0
    || clinicDataQuality.panelVisitWithoutPanel > 0
    || clinicDataQuality.consultationWithoutFee > 0;
  const partial = clinic.isError || financial.isError || financial.isLoading || attendance.isError || attendance.isLoading
    || !financial.data || financialIncomplete || clinicIncomplete || attendanceConfidence.level !== 'reliable';
  const retryPartial = clinic.isError || financial.isError || attendance.isError
    ? () => {
        if (clinic.isError) void clinic.refetch();
        if (financial.isError) void financial.refetch();
        if (attendance.isError) void attendance.refetch();
      }
    : undefined;

  return (
    <div className="space-y-4">
      {partial ? (
        <InsightState
          state="partial"
          label={clinic.isError || financial.isError || attendance.isError
            ? 'Some Command Centre sources could not be loaded.'
            : financial.isLoading || attendance.isLoading
              ? 'Some Command Centre sources are still loading.'
              : 'Some Command Centre data is incomplete.'}
          onRetry={retryPartial}
          retryLabel="Retry Command Centre sources"
        />
      ) : (
        <InsightState state="success" label="Command Centre data is up to date." />
      )}
      <CommandCentreTab
        healthMetrics={clinic.data.metrics}
        healthAlerts={clinic.data.alerts}
        financialSummary={financial.data ?? null}
        attendancePeriods={buildAttendanceSummary(attendanceCells)}
        averageWaitingMinutes={attendanceAverageWaiting(attendanceCells)}
        attendanceConfidence={attendanceConfidence}
        clinicLastRefreshedAt={clinic.dataUpdatedAt > 0 ? new Date(clinic.dataUpdatedAt).toISOString() : null}
        asOfDate={endKey}
        clinicSourceFailed={clinic.isError}
        financialSourceFailed={financial.isError}
      />
    </div>
  );
}
