import { ArrowRight } from 'lucide-react';

import type { FinancialControlReconciliation } from '@/lib/clinic/financialControl';

interface FinancialReconciliationProps {
  reconciliation: FinancialControlReconciliation;
}

function formatMoney(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `RM ${value.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Amount({ value }: { value: number | null }) {
  return (
    <span className="mt-0.5 block break-words text-sm font-semibold text-slate-950 tabular-nums">
      {formatMoney(value)}
    </span>
  );
}

function Rail({
  title,
  sourceLabel,
  sourceValue,
  children,
}: {
  title: string;
  sourceLabel: string;
  sourceValue: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 border-t border-slate-100 py-4 md:grid-cols-[minmax(9rem,0.7fr)_1.5rem_minmax(0,2fr)] md:items-center">
      <div className="min-w-0">
        <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
        <span className="mt-1 block text-[11px] text-slate-500">{sourceLabel}</span>
        <Amount value={sourceValue} />
      </div>
      <ArrowRight className="hidden h-4 w-4 text-slate-400 md:block" aria-hidden="true" />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function Term({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-slate-200 pl-3">
      <span className="block text-[11px] font-medium leading-4 text-slate-600">{label}</span>
      <Amount value={value} />
      {detail && <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{detail}</span>}
    </div>
  );
}

export function FinancialReconciliation({ reconciliation }: FinancialReconciliationProps) {
  return (
    <section
      aria-labelledby="financial-reconciliation-heading"
      className="rounded-lg border border-slate-200 bg-white px-4 shadow-[0_3px_14px_rgb(15,23,42,0.035)] sm:px-5"
    >
      <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="financial-reconciliation-heading" className="text-sm font-semibold text-slate-900">
            Reconciliation
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Bills, cash, and balances follow separate accounting paths.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">Amounts as of the selected period end</p>
      </div>

      <Rail
        title="Billed cohort"
        sourceLabel="Bills completed in period"
        sourceValue={reconciliation.billedCohort}
      >
        <Term label="Cohort collected" value={reconciliation.cohortCollected} />
        <Term
          label="Net adjustments"
          value={reconciliation.adjustments}
          detail={`Discounts ${formatMoney(reconciliation.discounts)} · Taxes ${formatMoney(reconciliation.taxes)} · Refunds ${formatMoney(reconciliation.refunds)} · ${reconciliation.corrections} corrections`}
        />
        <Term label="Cohort outstanding" value={reconciliation.cohortOutstanding} />
      </Rail>

      <Rail
        title="Period cash"
        sourceLabel="Payments received in period"
        sourceValue={reconciliation.cashCollected}
      >
        <Term label="Cohort collected" value={reconciliation.cohortCollected} />
        <Term label="Older debt collected" value={reconciliation.olderDebtCollected} />
      </Rail>

      <Rail
        title="Outstanding"
        sourceLabel="All active balances"
        sourceValue={reconciliation.totalOutstanding}
      >
        <Term label="Self-pay outstanding" value={reconciliation.selfPayOutstanding} />
        <Term label="Panel outstanding" value={reconciliation.panelOutstanding} />
      </Rail>
    </section>
  );
}
