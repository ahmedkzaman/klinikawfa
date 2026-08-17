import type { FinanceLedgerSummary as FinanceLedgerValues } from '@/lib/clinic/insight/financeSections';

const DEFINITIONS: Array<{
  key: keyof FinanceLedgerValues;
  label: string;
  definition: string;
  basis: string;
}> = [
  { key: 'visitBilled', label: 'Visit billed', definition: 'Completed visit bills in the selected period', basis: 'Visit completion date' },
  { key: 'patientCollected', label: 'Patient collected', definition: 'Physical payments received from patients', basis: 'Payment collection date' },
  { key: 'panelBilled', label: 'Panel billed', definition: 'Active claims created for panel-funded care', basis: 'Claim creation date' },
  { key: 'panelReceived', label: 'Panel received', definition: 'Panel remittances received, separate from patient cash', basis: 'Claim receipt date' },
  { key: 'patientOutstanding', label: 'Patient outstanding', definition: 'Active balances owed by patients at period end', basis: 'Balance as of period end' },
  { key: 'panelOutstanding', label: 'Panel outstanding', definition: 'Active receivables owed by panel providers', basis: 'Balance as of period end' },
];

function formatMoney(value: number | null): string {
  if (value === null) return 'Unavailable';
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FinanceLedgerSummary({ summary }: { summary: FinanceLedgerValues }) {
  return (
    <section
      aria-labelledby="finance-ledger-summary-heading"
      data-testid="finance-ledger-summary"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_3px_14px_rgb(15,23,42,0.035)]"
    >
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <h2 id="finance-ledger-summary-heading" className="text-sm font-semibold text-slate-900">Dual-ledger summary</h2>
        <p className="mt-0.5 text-xs text-slate-500">Billed work, patient cash, panel claims, and receivables remain separate.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {DEFINITIONS.map(({ key, label, definition, basis }) => (
          <div key={key} className="min-w-0 border-b border-r border-slate-100 p-4">
            <span className="block text-xs font-semibold text-slate-700">{label}</span>
            <span className="mt-1 block text-lg font-semibold leading-6 text-slate-950 tabular-nums">{formatMoney(summary[key])}</span>
            <span className="mt-1 block text-[11px] leading-4 text-slate-500">{definition}</span>
            <span className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{basis}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
