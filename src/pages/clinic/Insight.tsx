import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Navigate, useInRouterContext, useLocation } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ClinicHealthTab } from '@/components/clinic/insight/ClinicHealthTab';
import { FinanceTab } from '@/components/clinic/insight/finance/FinanceTab';
import { InsightShell } from '@/components/clinic/insight/InsightShell';
import { PerformanceTab } from '@/components/clinic/insight/performance/PerformanceTab';
import { PlanningTab } from '@/components/clinic/insight/planning/PlanningTab';
import { InsightState } from '@/components/clinic/insight/shared/InsightState';
import { useAuth } from '@/contexts/AuthContext';
import type { InsightPerformanceViewerScope } from '@/hooks/clinic/useInsightPerformance';
import { insightQueryFlags, insightQueryKeyPrefixes } from '@/hooks/clinic/useInsightSectionData';
import { getInsightAccess, type InsightAccess } from '@/lib/clinic/insight/insightAccess';
import { parseInsightSection, withInsightSection, type InsightSection } from '@/lib/clinic/insight/insightSections';

const MAX_RANGE_DAYS = 365;

function useOptionalQueryClient(): QueryClient | null {
  try { return useQueryClient(); } catch { return null; }
}

function parseDoctor(search: string): string | null {
  const value = new URLSearchParams(search).get('doctor');
  return value?.trim() || null;
}

function InsightRouterLocationSync({ onSearchChange }: { onSearchChange: (search: string) => void }) {
  const location = useLocation();
  useEffect(() => onSearchChange(location.search), [location.search, onSearchChange]);
  return null;
}

type InsightProps = {
  initialSearch?: string;
  canViewFinanceAdvanced?: boolean;
  canSeeNamedDoctors?: boolean;
  access?: InsightAccess;
  viewerRole?: string | null;
  viewerScope?: InsightPerformanceViewerScope | null;
};

export default function Insight({
  initialSearch,
  canViewFinanceAdvanced = false,
  canSeeNamedDoctors = false,
  access,
  viewerRole,
  viewerScope = null,
}: InsightProps) {
  const initialQuery = initialSearch ?? window.location.search;
  const [range, setRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 89), to: new Date() });
  const [section, setSection] = useState<InsightSection>(() => parseInsightSection(initialQuery));
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(() => parseDoctor(initialQuery));
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const queryClient = useOptionalQueryClient();
  const inRouter = useInRouterContext();
  const queryFlags = insightQueryFlags(section);
  const effectiveAccess = useMemo(
    () => access ?? getInsightAccess(canSeeNamedDoctors ? 'doctor_admin' : 'admin', null),
    [access, canSeeNamedDoctors],
  );

  useEffect(() => {
    const syncSection = () => {
      setSection(parseInsightSection(window.location.search));
      setSelectedDoctorId(parseDoctor(window.location.search));
    };
    window.addEventListener('popstate', syncSection);
    return () => window.removeEventListener('popstate', syncSection);
  }, []);

  const handleRangeSelect = useCallback((next: DateRange | undefined) => {
    if (!next?.from || !next?.to) { setRange(next); return; }
    if (next.from > next.to) { toast.warning('Start date cannot be after end date.'); return; }
    if (differenceInCalendarDays(next.to, next.from) > MAX_RANGE_DAYS) {
      toast.warning('Date range limited to 1 year for performance.');
      setRange({ from: next.from, to: subDays(next.from, -MAX_RANGE_DAYS) });
      return;
    }
    setRange(next);
  }, []);

  const startDate = range?.from ?? subDays(new Date(), 89);
  const endDate = range?.to ?? new Date();

  const handleSectionChange = useCallback((next: InsightSection) => {
    const params = new URLSearchParams(withInsightSection(window.location.search, next));
    if (next !== 'performance') params.delete('doctor');
    window.history.pushState(null, '', `?${params.toString()}`);
    setSection(next);
    if (next !== 'performance') setSelectedDoctorId(null);
  }, []);

  const handleDoctorChange = useCallback((doctorId: string | null, options?: { replace?: boolean }) => {
    const params = new URLSearchParams(window.location.search);
    params.set('section', 'performance');
    if (doctorId) params.set('doctor', doctorId); else params.delete('doctor');
    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', `?${params.toString()}`);
    setSelectedDoctorId(doctorId);
  }, []);

  const handleRouterSearchChange = useCallback((search: string) => {
    setSection(parseInsightSection(search));
    setSelectedDoctorId(parseDoctor(search));
  }, []);

  const handleRefresh = useCallback(() => {
    if (!queryClient) return;
    insightQueryKeyPrefixes(section).forEach((queryKey) => { void queryClient.invalidateQueries({ queryKey: [...queryKey] }); });
  }, [queryClient, section]);

  return (
    <>
      {inRouter ? <InsightRouterLocationSync onSearchChange={handleRouterSearchChange} /> : null}
      <InsightShell
        section={section}
        onSectionChange={handleSectionChange}
        range={range}
        onRangeChange={handleRangeSelect}
        comparisonEnabled={comparisonEnabled}
        onComparisonChange={setComparisonEnabled}
        onRefresh={handleRefresh}
        exportItems={[]}
        confidence={comparisonEnabled ? 'comparison enabled' : 'current period'}
      >
        <InsightSectionContent
          section={section}
          queryFlags={queryFlags}
          startDate={startDate}
          endDate={endDate}
          canViewFinanceAdvanced={canViewFinanceAdvanced}
          access={effectiveAccess}
          viewerRole={viewerRole}
          viewerScope={viewerScope}
          selectedDoctorId={selectedDoctorId}
          onDoctorChange={handleDoctorChange}
          comparisonEnabled={comparisonEnabled}
        />
      </InsightShell>
    </>
  );
}

export function InsightRoute() {
  const {
    role, user, rolesLoading, canViewInsights, insightAccessLoading,
    insightDoctorId, insightPermissionVersion,
    canViewManagementDashboard, managementDashboardAccessLoading,
  } = useAuth();
  const access = getInsightAccess(role, insightDoctorId);
  if (rolesLoading || insightAccessLoading) return <InsightState state="loading" label="Checking Clinic Insight access…" />;
  if (!access.canOpenInsight || !canViewInsights || !user) return <Navigate to="/clinic/queue" replace />;

  const viewerScope: InsightPerformanceViewerScope = {
    userId: user.id,
    reportsView: { allowed: canViewInsights, version: insightPermissionVersion },
  };
  return (
    <Insight
      canViewFinanceAdvanced={!managementDashboardAccessLoading && canViewManagementDashboard}
      canSeeNamedDoctors={access.canSeeNamedDoctors}
      access={access}
      viewerRole={role}
      viewerScope={viewerScope}
    />
  );
}

function InsightSectionContent({
  section, queryFlags, startDate, endDate, canViewFinanceAdvanced, access,
  viewerRole, viewerScope, selectedDoctorId, onDoctorChange,
  comparisonEnabled,
}: {
  section: InsightSection;
  queryFlags: ReturnType<typeof insightQueryFlags>;
  startDate: Date;
  endDate: Date;
  canViewFinanceAdvanced: boolean;
  access: InsightAccess;
  viewerRole: string | null | undefined;
  viewerScope: InsightPerformanceViewerScope | null;
  selectedDoctorId: string | null;
  onDoctorChange: (doctorId: string | null, options?: { replace?: boolean }) => void;
  comparisonEnabled: boolean;
}) {
  switch (section) {
    case 'command':
      return <ClinicHealthTab startDate={startDate} endDate={endDate} enabled={queryFlags.command} />;
    case 'finance':
      return <FinanceTab startDate={startDate} endDate={endDate} enabled={queryFlags.finance} canViewAdvanced={canViewFinanceAdvanced} canSeeNamedDoctors={access.canSeeNamedDoctors} />;
    case 'performance':
      return <PerformanceTab startDate={startDate} endDate={endDate} enabled={queryFlags.performance} comparisonEnabled={comparisonEnabled} access={access} viewerRole={viewerRole ?? null} viewerScope={viewerScope} selectedDoctorId={selectedDoctorId} onDoctorChange={onDoctorChange} />;
    case 'planning':
      return <PlanningTab startDate={startDate} endDate={endDate} enabled={queryFlags.planning} />;
  }
}
