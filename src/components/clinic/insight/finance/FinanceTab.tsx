import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { BankHealthTab } from '../BankHealthTab';
import { InsightState } from '../shared/InsightState';
import { useInsightExportRegistration } from '../InsightShell';
import type { InsightExportItem } from '../shared/InsightExportMenu';
import { ValuationTab } from '../ValuationTab';
import { FinancialControlTab } from '../management/FinancialControlTab';
import { FinanceLedgerSummary } from './FinanceLedgerSummary';
import { CollectionDetailSheet } from './CollectionDetailSheet';
import { PanelLifecycleTable, type PanelLifecycleClaim } from './PanelLifecycleTable';
import { useFinancialControlSummary } from '@/hooks/clinic/useFinancialControl';
import { useFinancialInsights, type RawFinancialRow } from '@/hooks/clinic/useFinancialInsights';
import { usePanelBilledInsights } from '@/hooks/clinic/usePanelBilledInsights';
import { useSalesInsights, type SalesInsightRow } from '@/hooks/clinic/useSalesInsights';
import { cn } from '@/lib/utils';
import { csvEscape, downloadInsightCsv } from '@/lib/clinic/insight/exports';
import {
  FINANCE_SECTIONS,
  buildFinanceDailyRevenueCsv,
  buildFinanceLedgerSummary,
  buildPanelClaimsCsv,
  groupFinanceCollections,
  parseFinanceSection,
  parseFinanceCollection,
  withFinanceSection,
  type FinanceSection,
  type FinanceCollectionKey,
} from '@/lib/clinic/insight/financeSections';

type FinanceTabProps = {
  startDate: Date;
  endDate: Date;
  enabled?: boolean;
  canViewAdvanced?: boolean;
  canSeeNamedDoctors?: boolean;
};

const SECTION_LABELS: Record<FinanceSection, string> = {
  summary: 'Summary',
  collections: 'Collections',
  panels: 'Panels',
  costs: 'Costs & Margin',
  reconciliation: 'Reconciliation',
  advanced: 'Advanced',
};

const EMPTY_FINANCIAL_ROWS: RawFinancialRow[] = [];
const EMPTY_SALES_ROWS: SalesInsightRow[] = [];
const EMPTY_PANEL_CLAIMS: PanelLifecycleClaim[] = [];

function dateFileRange(startDate: Date, endDate: Date): string {
  return `${format(startDate, 'yyyyMMdd')}_to_${format(endDate, 'yyyyMMdd')}`;
}

function consultationCsv(rows: RawFinancialRow[]): string[] {
  return [
    ['visit_date', 'queue_entry_id', 'payment_method', 'item_name', 'kind', 'revenue', 'cogs', 'profit', 'has_missing_cogs'].join(','),
    ...rows.map((row) => [
      row.visit_date, row.queue_entry_id, row.payment_method, row.item_name, row.kind,
      row.revenue.toFixed(2), row.cogs.toFixed(2), row.profit.toFixed(2), String(row.hasMissingCogs),
    ].map(csvEscape).join(',')),
  ];
}

function collectedCsv(rows: SalesInsightRow[]): string[] {
  return [
    ['created_at', 'payment_id', 'queue_entry_id', 'consultation_id', 'payment_type', 'payment_method', 'amount'].join(','),
    ...rows.map((row) => [
      row.createdAt, row.paymentId, row.queueEntryId, row.consultationId,
      row.paymentType, row.paymentMethod, row.amount.toFixed(2),
    ].map(csvEscape).join(',')),
  ];
}

function reconciliationCsv(data: ReturnType<typeof useFinancialControlSummary>['data']): string[] {
  if (!data) return [];
  const reconciliation = data.reconciliation;
  return [
    'metric,amount',
    ...[
      ['billed_cohort', reconciliation.billedCohort],
      ['cohort_collected', reconciliation.cohortCollected],
      ['older_debt_collected', reconciliation.olderDebtCollected],
      ['cash_collected', reconciliation.cashCollected],
      ['adjustments', reconciliation.adjustments],
      ['patient_outstanding', reconciliation.selfPayOutstanding],
      ['panel_outstanding', reconciliation.panelOutstanding],
      ['total_outstanding', reconciliation.totalOutstanding],
    ].map(([label, value]) => `${label},${value === null ? '' : Number(value).toFixed(2)}`),
  ];
}

function formatMoney(value: number): string {
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinanceTab({
  startDate,
  endDate,
  enabled = true,
  canViewAdvanced = false,
  canSeeNamedDoctors = false,
}: FinanceTabProps) {
  const [section, setSection] = useState<FinanceSection>(() => parseFinanceSection(window.location.search));
  const [activeCollection, setActiveCollection] = useState<FinanceCollectionKey | null>(() => parseFinanceCollection(window.location.search));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const financialControl = useFinancialControlSummary({ from: startDate, to: endDate }, { enabled });
  const financial = useFinancialInsights(startDate, endDate, { enabled });
  const sales = useSalesInsights(startDate, endDate, { enabled });
  const panel = usePanelBilledInsights(startDate, endDate, { enabled });
  const financialRows = financial.data?.rows ?? EMPTY_FINANCIAL_ROWS;
  const salesRows = sales.data?.rows ?? EMPTY_SALES_ROWS;
  const panelClaims = (panel.data?.claims ?? EMPTY_PANEL_CLAIMS) as PanelLifecycleClaim[];

  useEffect(() => {
    const sync = () => {
      setSection(parseFinanceSection(window.location.search));
      setActiveCollection(parseFinanceCollection(window.location.search));
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const selectSection = useCallback((next: FinanceSection) => {
    window.history.pushState(null, '', withFinanceSection(window.location.search, next));
    setSection(next);
    setActiveCollection(null);
  }, []);

  const exportItems = useMemo<InsightExportItem[]>(() => [
    {
      id: 'finance-consultation-csv', label: 'Consultation CSV',
      download: () => { downloadInsightCsv(consultationCsv(financialRows), `clinic_financials_${dateFileRange(startDate, endDate)}.csv`); toast.success('Exported consultation CSV.'); },
      disabled: financial.isLoading || financialRows.length === 0,
      disabledReason: 'No consultation rows are available for this period.',
    },
    {
      id: 'finance-collected-csv', label: 'Collected CSV',
      download: () => { downloadInsightCsv(collectedCsv(salesRows), `clinic_collections_${dateFileRange(startDate, endDate)}.csv`); toast.success('Exported collected payments CSV.'); },
      disabled: sales.isLoading || salesRows.length === 0,
      disabledReason: 'No physical patient collections are available for this period.',
    },
    {
      id: 'finance-daily-revenue-csv', label: 'Daily Consultation Revenue',
      download: () => { downloadInsightCsv(buildFinanceDailyRevenueCsv(financialRows, salesRows, panelClaims), `daily_consultation_revenue_${dateFileRange(startDate, endDate)}.csv`); toast.success('Exported daily consultation revenue.'); },
      disabled: financial.isLoading || financialRows.length === 0,
      disabledReason: 'No consultation rows are available for this period.',
    },
    {
      id: 'finance-panel-claims-csv', label: 'Panel claim detail',
      download: () => { downloadInsightCsv(buildPanelClaimsCsv(panelClaims), `panel_claims_${dateFileRange(startDate, endDate)}.csv`); toast.success('Exported panel claim detail.'); },
      disabled: panel.isLoading || panelClaims.length === 0,
      disabledReason: 'No panel claims are available for this period.',
    },
    {
      id: 'finance-reconciliation-csv', label: 'Reconciliation detail',
      download: () => { downloadInsightCsv(reconciliationCsv(financialControl.data), `financial_reconciliation_${dateFileRange(startDate, endDate)}.csv`); toast.success('Exported reconciliation detail.'); },
      disabled: financialControl.isLoading || !financialControl.data,
      disabledReason: 'Reconciliation is not available for this period.',
    },
  ], [endDate, financial.isLoading, financialControl.data, financialControl.isLoading, financialRows, panel.isLoading, panelClaims, sales.isLoading, salesRows, startDate]);
  useInsightExportRegistration('finance-workspace', exportItems);

  const ledgerSummary = buildFinanceLedgerSummary({
    financialControl: financialControl.data,
    sales: sales.data,
    panelBilled: panel.data,
  });
  const collectionGroups = groupFinanceCollections(salesRows);
  const openCollectionDetails = (collection: FinanceCollectionKey) => {
    const params = new URLSearchParams(window.location.search);
    params.set('section', 'finance');
    params.set('finance', 'collections');
    params.set('metric', 'cash_collected');
    params.set('collection', collection);
    window.history.pushState(null, '', `?${params.toString()}`);
    setActiveCollection(collection);
  };
  const closeCollectionDetails = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('collection');
    if (params.get('metric') === 'cash_collected') params.delete('metric');
    window.history.replaceState(null, '', `?${params.toString()}`);
    setActiveCollection(null);
  };
  const summaryHasData = Boolean(financialControl.data || sales.data || panel.data);
  const summaryHasError = financialControl.isError || sales.isError || panel.isError;
  const summaryHasLoading = financialControl.isLoading || sales.isLoading || panel.isLoading;
  const retrySummary = () => {
    if (financialControl.isError) void financialControl.refetch?.();
    if (sales.isError) void sales.refetch?.();
    if (panel.isError) void panel.refetch?.();
  };
  const summaryError = [financialControl.error, sales.error, panel.error]
    .filter((error): error is Error => error instanceof Error)
    .map((error) => error.message)
    .join('; ');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Finance</h1>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">Visit billing, physical collections, panel claims, cost, and receivables in one ledger-safe workspace.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        <div role="tablist" aria-label="Finance sections" className="flex w-max min-w-full gap-1">
          {FINANCE_SECTIONS.map((item, index) => (
            <button
              key={item}
              ref={(element) => { tabRefs.current[index] = element; }}
              type="button" role="tab" aria-selected={section === item} tabIndex={section === item ? 0 : -1}
              aria-controls={`finance-panel-${item}`}
              onClick={() => selectSection(item)}
              onKeyDown={(event) => {
                const next = event.key === 'ArrowRight' ? (index + 1) % FINANCE_SECTIONS.length
                  : event.key === 'ArrowLeft' ? (index - 1 + FINANCE_SECTIONS.length) % FINANCE_SECTIONS.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? FINANCE_SECTIONS.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                selectSection(FINANCE_SECTIONS[next]);
                tabRefs.current[next]?.focus();
              }}
              className={cn('rounded-md px-3 py-2 text-xs font-medium transition-colors', section === item ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {SECTION_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <div id={`finance-panel-${section}`} role="tabpanel" aria-label={SECTION_LABELS[section]} className="space-y-4">
        {section === 'summary' && (
          summaryHasLoading && !summaryHasData ? (
            <InsightState state="loading" label="Loading Finance summary…" />
          ) : summaryHasError && !summaryHasData ? (
            <InsightState state="error" label="Finance summary" error={summaryError ? new Error(summaryError) : undefined} onRetry={retrySummary} retryLabel="Retry failed Finance sources" />
          ) : (
            <>
              {summaryHasError || summaryHasLoading ? (
                <InsightState
                  state="partial"
                  label={summaryHasError ? 'Some Finance sources could not be refreshed.' : 'Some Finance sources are still loading.'}
                  onRetry={summaryHasError ? retrySummary : undefined}
                  retryLabel="Retry failed Finance sources"
                />
              ) : null}
              <FinanceLedgerSummary summary={ledgerSummary} />
            </>
          )
        )}

        {section === 'collections' && (
          sales.isLoading ? <InsightState state="loading" label="Loading patient collections…" /> : sales.isError && !sales.data ? (
            <InsightState state="error" label="Patient collections" error={sales.error} onRetry={() => void sales.refetch()} />
          ) : (
            <>
              {sales.isError ? <InsightState state="partial" label="Patient collections could not be refreshed." onRetry={() => void sales.refetch()} retryLabel="Retry patient collections" /> : null}
              <section aria-labelledby="finance-collections-heading" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                  <h2 id="finance-collections-heading" className="text-sm font-semibold text-slate-900">Physical collections</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Panel allocation markers are excluded from patient cash.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
                  {collectionGroups.map((group) => (
                    <button key={group.key} type="button" data-collection-method={group.key} onClick={() => openCollectionDetails(group.key)} className="border-b border-r border-slate-100 p-4 text-left hover:bg-slate-50">
                      <span className="block text-xs font-semibold text-slate-700">{group.label}</span>
                      <span className="mt-1 block text-lg font-semibold text-slate-950 tabular-nums">{formatMoney(group.collected)}</span>
                      <span className="mt-1 block text-[11px] text-slate-500">{group.paymentCount} payment{group.paymentCount === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )
        )}

        {section === 'panels' && (
          panel.isLoading ? <InsightState state="loading" label="Loading panel claims…" /> : panel.isError && !panel.data ? (
            <InsightState state="error" label="Panel claims" error={panel.error} onRetry={() => void panel.refetch()} />
          ) : (
            <>
              {panel.isError ? <InsightState state="partial" label="Panel claims could not be refreshed." onRetry={() => void panel.refetch()} retryLabel="Retry panel claims" /> : null}
              <PanelLifecycleTable claims={panelClaims} asOfDate={format(endDate, 'yyyy-MM-dd')} />
            </>
          )
        )}

        {(section === 'costs' || section === 'reconciliation') && (
          <FinancialControlTab
            startDate={startDate} endDate={endDate} enabled={enabled} showHeader={false}
            display={section === 'costs' ? 'costs' : 'reconciliation'}
          />
        )}

        {section === 'advanced' && (
          canViewAdvanced ? (
            <div className="space-y-4">
              <BankHealthTab startDate={startDate} endDate={endDate} enabled={enabled} canSeeNamedDoctors={canSeeNamedDoctors} />
              <ValuationTab startDate={startDate} endDate={endDate} enabled={enabled} />
            </div>
          ) : (
            <section role="note" className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600">
              Advanced finance is permission restricted.
            </section>
          )
        )}

        {!['costs', 'reconciliation', 'advanced'].includes(section) && (
          <FinancialControlTab startDate={startDate} endDate={endDate} enabled={enabled} showHeader={false} display="details" />
        )}
      </div>
      <CollectionDetailSheet collection={activeCollection} rows={salesRows} onClose={closeCollectionDetails} />
    </div>
  );
}
