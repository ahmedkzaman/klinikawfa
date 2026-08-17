import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { panelClaimFinancialAmounts, panelClaimHref, panelLifecycleLabel } from '@/lib/clinic/insight/financeSections';

export type PanelLifecycleClaim = {
  id?: string | null;
  queue_entry_id?: string | null;
  claim_date?: string | null;
  due_date?: string | null;
  received_date?: string | null;
  amount: number | string | null;
  received_amount?: number | string | null;
  status: string;
  provider_name?: string | null;
  panel_provider_name?: string | null;
  insurance_providers?: { name?: string | null } | null;
};

function money(value: number): string {
  return `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function providerName(claim: PanelLifecycleClaim): string {
  return claim.provider_name ?? claim.panel_provider_name ?? claim.insurance_providers?.name ?? 'Provider unavailable';
}

export function PanelLifecycleTable({ claims, asOfDate }: { claims: PanelLifecycleClaim[]; asOfDate: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">Panel lifecycle</h2>
        <p className="mt-0.5 text-xs text-slate-500">Claims by provider, lifecycle state, receipts, and outstanding balance.</p>
      </div>
      {claims.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-slate-500">No panel claims in this period</p>
      ) : (
        <Table aria-label="Panel claim lifecycle" className="min-w-[720px]">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Claim date</TableHead>
              <TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Records</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim, index) => {
              const { billed, received, outstanding } = panelClaimFinancialAmounts(claim);
              return (
                <TableRow key={claim.id ?? `${claim.queue_entry_id ?? 'claim'}-${index}`}>
                  <TableCell className="font-medium text-slate-900">{providerName(claim)}</TableCell>
                  <TableCell>{panelLifecycleLabel(claim, asOfDate)}</TableCell><TableCell>{claim.claim_date ?? 'Unavailable'}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(billed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(received)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(outstanding)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {claim.id ? (
                        <a aria-label={`Claim ${claim.id}`} className="text-xs font-medium text-blue-700 hover:underline" href={panelClaimHref(claim.id)}>Claim</a>
                      ) : null}
                      {claim.queue_entry_id ? <a className="text-xs font-medium text-blue-700 hover:underline" href={`/clinic/visits/${claim.queue_entry_id}`}>Visit</a> : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
