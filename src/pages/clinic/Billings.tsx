import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { ArrowDown, ArrowUp, ExternalLink, Receipt, Printer, Download } from 'lucide-react';
import { PrintReceiptDialog } from '@/components/clinic/billing/PrintReceiptDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toMalayTitleCase } from '@/lib/textCase';
import {
  bento,
  pageInner,
  pageShell,
  softInput,
} from '@/lib/clinic/bentoTokens';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentsLedger } from '@/hooks/clinic/usePayments';
import { formatQueueNo } from '@/lib/clinic/queueNumber';
import {
  formatPaymentMethod,
  paymentMethodBadgeClass,
} from '@/lib/clinic/paymentMethod';
import { sumActiveBillingLines } from '@/lib/clinic/billingLedgerTotals';
import { fetchAllBillingRows } from '@/lib/clinic/fetchAllBillingRows';
import {
  sortBillingEntries,
  type BillingSortDirection,
  type BillingSortKey,
} from '@/lib/clinic/billingLedgerSort';
import { Badge } from '@/components/ui/badge';
import type { ConsultationRow, ConsultationItemRow } from '@/types/clinic';
import { calculateDualLedger } from '@/lib/clinic/dualLedger';

type TabKey = 'paid' | 'panel' | 'self_pay';

interface LedgerEntry {
  queueEntryId: string;
  queueLabel: string;
  patientId: string;
  patientName: string;
  createdAt: string;
  clinicStatus: string;
  subtotal: number;
  paid: number;
  outstanding: number;
  creditDue: number;
  panelCovered: number;
  panelOutstanding: number;
  unattributedBalance: number;
  unitemizedAdditionalCharges: number;
  latestPaymentType: 'self_pay' | 'panel' | 'insurance';
  latestMethod: string | null;
  latestPaymentId: string | null;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'paid', label: 'Paid' },
  { key: 'panel', label: 'Outstanding Panel' },
  { key: 'self_pay', label: 'Outstanding Self-Pay' },
];

const sortableHeaders: Partial<
  Record<string, { key: BillingSortKey; label: string }>
> = {
  DATE: { key: 'date', label: 'Date' },
  SUBTOTAL: { key: 'subtotal', label: 'Subtotal' },
  PAID: { key: 'paid', label: 'Paid' },
  OUTSTANDING: { key: 'outstanding', label: 'Outstanding' },
  METHOD: { key: 'method', label: 'Method' },
};

export default function Billings() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<string>(
    format(subDays(today, 30), 'yyyy-MM-dd'),
  );
  const [to, setTo] = useState<string>(format(today, 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<TabKey>('paid');
  const [printPaymentId, setPrintPaymentId] = useState<string | null>(null);
  const [downloadPaymentId, setDownloadPaymentId] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    key: BillingSortKey;
    direction: BillingSortDirection;
  }>({ key: 'date', direction: 'desc' });

  const fromISO = useMemo(() => new Date(`${from}T00:00:00`).toISOString(), [from]);
  const toISO = useMemo(() => new Date(`${to}T23:59:59`).toISOString(), [to]);

  const { data: ledger = [], isLoading: ledgerLoading } = usePaymentsLedger(
    fromISO,
    toISO,
  );

  // Collect unique queue_entry_ids and fetch consultation_items totals.
  const queueEntryIds = useMemo(
    () =>
      Array.from(
        new Set(
          ledger.map((p) => p.queue_entries?.id).filter(Boolean) as string[],
        ),
      ),
    [ledger],
  );

  const { data: itemsByQueue = {}, isLoading: itemsLoading } = useQuery<
    Record<string, number>
  >({
    queryKey: ['ledger_item_totals', queueEntryIds.sort().join(',')],
    enabled: queueEntryIds.length > 0,
    queryFn: async () => {
      const { data: consultations, error: cErr } = await supabase
        .from('consultations')
        .select('id, queue_entry_id')
        .in('queue_entry_id', queueEntryIds)
        .is('deleted_at', null);
      if (cErr) throw cErr;

      const consultationIds = (consultations ?? []).map(
        (c: Pick<ConsultationRow, 'id' | 'queue_entry_id'>) => c.id,
      );
      if (consultationIds.length === 0) return {};

      const items = await fetchAllBillingRows(async (from, to) => {
        const { data, error } = await supabase
          .from('consultation_items')
          .select('consultation_id, price, quantity')
          .in('consultation_id', consultationIds)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return data ?? [];
      });

      const linesByConsultation: Record<
        string,
        Array<Pick<ConsultationItemRow, 'price' | 'quantity'>>
      > = {};
      (items ?? []).forEach((it: Pick<ConsultationItemRow, 'consultation_id' | 'price' | 'quantity'>) => {
        (linesByConsultation[it.consultation_id] ??= []).push(it);
      });

      const totalsByConsultation: Record<string, number> = {};
      Object.entries(linesByConsultation).forEach(([consultationId, lines]) => {
        totalsByConsultation[consultationId] = sumActiveBillingLines(lines);
      });

      const totalsByQueue: Record<string, number> = {};
      (consultations ?? []).forEach(
        (c: Pick<ConsultationRow, 'id' | 'queue_entry_id'>) => {
          totalsByQueue[c.queue_entry_id] =
            (totalsByQueue[c.queue_entry_id] ?? 0) +
            (totalsByConsultation[c.id] ?? 0);
        },
      );
      return totalsByQueue;
    },
  });

  const { data: claimsByQueue = {}, isLoading: claimsLoading } = useQuery<Record<string, {
    amount: number;
    receivedAmount: number;
    status: string;
  }>>({
    queryKey: ['billing-panel-claims', queueEntryIds.slice().sort().join(',')],
    enabled: queueEntryIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('panel_claims')
        .select('queue_entry_id, amount, received_amount, status')
        .in('queue_entry_id', queueEntryIds);
      if (error) throw error;
      const grouped: Record<string, { amount: number; receivedAmount: number; status: string }> = {};
      for (const claim of data ?? []) {
        const id = claim.queue_entry_id;
        if (!id) continue;
        const status = String(claim.status ?? '').toLowerCase();
        if (!['pending', 'submitted', 'approved', 'received'].includes(status)) continue;
        const current = grouped[id] ?? { amount: 0, receivedAmount: 0, status };
        current.amount += Number(claim.amount ?? 0);
        current.receivedAmount += Number(claim.received_amount ?? 0);
        current.status = status;
        grouped[id] = current;
      }
      return grouped;
    },
  });

  const entries: LedgerEntry[] = useMemo(() => {
    const byQueue = new Map<string, LedgerEntry>();
    // Sort by created_at ascending so the LAST iteration wins for "latest".
    const sortedAsc = [...ledger].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (const p of sortedAsc) {
      const qe = p.queue_entries;
      if (!qe) continue;
      const existing = byQueue.get(qe.id);
      const amt = Number(p.amount ?? 0);
      const pType = (p.payment_type ?? 'self_pay') as
        | 'self_pay'
        | 'panel'
        | 'insurance';

      if (existing) {
        existing.paid += amt;
        existing.latestPaymentType = pType;
        existing.latestMethod = p.payment_method ?? existing.latestMethod;
        existing.latestPaymentId = p.id;
      } else {
        byQueue.set(qe.id, {
          queueEntryId: qe.id,
          queueLabel: formatQueueNo(qe.created_at, qe.queue_sequence),
          patientId: qe.patient_id,
          patientName: qe.patients?.name ? toMalayTitleCase(qe.patients.name) : '—',
          createdAt: qe.created_at,
          clinicStatus: qe.clinic_status,
          subtotal: itemsByQueue[qe.id] ?? 0,
          paid: amt,
          outstanding: 0,
          creditDue: 0,
          panelCovered: 0,
          panelOutstanding: 0,
          unattributedBalance: 0,
          unitemizedAdditionalCharges: 0,
          latestPaymentType: pType,
          latestMethod: p.payment_method ?? null,
          latestPaymentId: p.id,
        });
      }

    }

    const list = Array.from(byQueue.values());
    list.forEach((e) => {
      const expectsPanel = e.latestPaymentType === 'panel' || e.latestPaymentType === 'insurance';
      const claim = claimsByQueue[e.queueEntryId];
      const state = calculateDualLedger({
        billedTotal: e.subtotal,
        patientPayments: [e.paid],
        expectsPanel,
        panelClaim: claim ? { amount: claim.amount, receivedAmount: claim.receivedAmount, status: claim.status } : null,
      });
      e.subtotal = state.billedTotal;
      e.paid = state.patientPaid;
      e.outstanding = state.patientOutstanding;
      e.panelCovered = state.panelCovered;
      e.panelOutstanding = state.panelOutstanding;
      e.unattributedBalance = state.unattributedBalance;
      e.creditDue = state.creditDue;
      e.unitemizedAdditionalCharges = 0;
    });
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [claimsByQueue, ledger, itemsByQueue]);

  const filtered = useMemo<LedgerEntry[]>(() => {
    if (activeTab === 'paid') {
      return entries.filter(
        (e) => e.outstanding <= 0 && e.panelOutstanding <= 0 && e.unattributedBalance <= 0 && e.clinicStatus === 'completed',
      );
    }
    if (activeTab === 'panel') {
      return entries.filter(
        (e) =>
          e.panelOutstanding > 0 &&
          (e.latestPaymentType === 'panel' ||
            e.latestPaymentType === 'insurance'),
      );
    }
    return entries.filter(
      (e) => e.outstanding > 0 && e.latestPaymentType === 'self_pay',
    );
  }, [entries, activeTab]);

  const sortedFiltered = useMemo(
    () => sortBillingEntries(filtered, sort.key, sort.direction),
    [filtered, sort],
  );

  const counts = useMemo(() => {
    const panelRows = entries.filter(
      (e) =>
        e.panelOutstanding > 0 &&
        (e.latestPaymentType === 'panel' ||
          e.latestPaymentType === 'insurance'),
    );
    const selfPayRows = entries.filter(
      (e) => e.outstanding > 0 && e.latestPaymentType === 'self_pay',
    );
    return {
      paid: entries.filter(
        (e) => e.outstanding <= 0 && e.panelOutstanding <= 0 && e.unattributedBalance <= 0 && e.clinicStatus === 'completed',
      ).length,
      panel: panelRows.length,
      self_pay: selfPayRows.length,
    };
  }, [entries]);

  const isLoading = ledgerLoading || itemsLoading || claimsLoading;

  const handleSort = (key: BillingSortKey) => {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key,
        direction: key === 'date' ? 'desc' : 'asc',
      };
    });
  };

  // Daily breakdown by payment_method, computed from raw ledger so every
  // payment row lands in its actual bucket (not just the latest per visit).
  const methodTotals = useMemo(() => {
    const totals: Record<string, number> = {
      cash: 0,
      qr_pay: 0,
      card: 0,
      transfer: 0,
      other: 0,
    };
    for (const p of ledger) {
      const amt = Number(p.amount ?? 0);
      const key = p.payment_method && totals[p.payment_method] !== undefined
        ? p.payment_method
        : 'other';
      totals[key] += amt;
    }
    return totals;
  }, [ledger]);


  return (
    <div className={pageShell}>
      <div className={pageInner}>
        {/* Header bar */}
        <div className={cn(bento, 'p-4 flex items-end justify-between gap-4 flex-wrap')}>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Billings</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Financial overview for self-pay and panel claims. Each row is one visit.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                From
              </Label>
              <Input
                id="from"
                type="date"
                className={cn(softInput, 'h-9 w-40')}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                To
              </Label>
              <Input
                id="to"
                type="date"
                className={cn(softInput, 'h-9 w-40')}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Pill tabs */}
        <div className={cn(bento, 'p-2 flex items-center gap-1 flex-wrap')}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'ml-1.5 text-xs',
                    active ? 'text-white/80' : 'text-slate-400',
                  )}
                >
                  ({counts[tab.key]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Daily method totals — only on Paid tab, computed from raw ledger */}
        {activeTab === 'paid' && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { key: 'cash', label: 'Cash' },
              { key: 'qr_pay', label: 'QR Pay' },
              { key: 'card', label: 'Card' },
              { key: 'transfer', label: 'Transfer' },
              { key: 'other', label: 'Legacy / Other' },
            ].map((t) => (
              <div key={t.key} className={cn(bento, 'p-3')}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      t.key === 'cash' && 'bg-emerald-500',
                      t.key === 'qr_pay' && 'bg-sky-500',
                      t.key === 'card' && 'bg-violet-500',
                      t.key === 'transfer' && 'bg-amber-500',
                      t.key === 'other' && 'bg-slate-400',
                    )}
                  />
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    {t.label}
                  </span>
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-800 tabular-nums">
                  RM {(methodTotals[t.key] ?? 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={cn(bento, 'overflow-hidden')}>
          <div
            data-testid="billing-ledger-header"
            className="grid grid-cols-[80px_1fr_140px_100px_100px_100px_120px_140px] gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60"
          >
            {['QUEUE', 'PATIENT', 'DATE', 'SUBTOTAL', 'PAID', 'OUTSTANDING', 'METHOD', ''].map((col) => {
              const sortable = sortableHeaders[col];
              const active = sortable?.key === sort.key;
              return (
                <span
                  key={col}
                  className="text-[11px] font-bold text-slate-500 uppercase tracking-wider"
                >
                  {sortable ? (
                    <button
                      type="button"
                      aria-sort={
                        active
                          ? sort.direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      onClick={() => handleSort(sortable.key)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1 py-0.5 -ml-1 uppercase tracking-wider transition-colors hover:bg-slate-100 hover:text-slate-700',
                        active && 'text-slate-800',
                      )}
                    >
                      {sortable.label}
                      {active &&
                        (sort.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ))}
                    </button>
                  ) : (
                    col
                  )}
                </span>
              );
            })}
          </div>


          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sortedFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Receipt className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-600">No entries in this view</p>
              <p className="text-xs mt-1 text-slate-500">
                Try adjusting the date range or switch tabs.
              </p>
            </div>
          ) : (
            sortedFiltered.map((e) => {
              const displayedOutstanding = activeTab === 'panel'
                ? e.panelOutstanding
                : e.outstanding;
              return (
              <div
                key={e.queueEntryId}
                className="grid grid-cols-[80px_1fr_140px_100px_100px_100px_120px_140px] gap-2 px-4 py-3 border-b border-slate-100 last:border-0 items-center hover:bg-slate-50/60 transition-colors"
              >
                <span className="text-sm tabular-nums text-slate-600">
                  {e.queueLabel}
                </span>
                <span className="text-sm font-medium text-slate-800 truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{e.patientName}</span>
                </span>
                <span className="text-xs text-slate-500">
                  {format(new Date(e.createdAt), 'd MMM, h:mm a')}
                </span>
                <span className="text-sm tabular-nums text-slate-600">
                  RM {e.subtotal.toFixed(2)}
                  {e.unitemizedAdditionalCharges > 0 && (
                    <span
                      className="block text-[10px] text-amber-600"
                      title="Additional charge was collected but was not itemized in this legacy visit."
                    >
                      Includes RM {e.unitemizedAdditionalCharges.toFixed(2)} other fees
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-slate-600">
                  RM {e.paid.toFixed(2)}
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    displayedOutstanding > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600',
                  )}
                >
                  {e.creditDue > 0
                    ? `Credit RM ${e.creditDue.toFixed(2)}`
                    : `RM ${displayedOutstanding.toFixed(2)}`}
                </span>
                <span>
                  {e.paid > 0 || e.latestMethod ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] py-0 px-1.5 h-5',
                        paymentMethodBadgeClass(e.latestMethod),
                      )}
                    >
                      {formatPaymentMethod(e.latestMethod, e.paid)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </span>

                <div className="flex items-center gap-1">
                  {e.latestPaymentId && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => setPrintPaymentId(e.latestPaymentId)}
                        title="Print receipt"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => setDownloadPaymentId(e.latestPaymentId)}
                        title="Download PDF receipt"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Link to={`/clinic/visits/${e.queueEntryId}`}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open
                    </Link>
                  </Button>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      <PrintReceiptDialog
        open={!!printPaymentId}
        onOpenChange={(o) => !o && setPrintPaymentId(null)}
        paymentId={printPaymentId}
      />

      <PrintReceiptDialog
        open={!!downloadPaymentId}
        onOpenChange={(o) => !o && setDownloadPaymentId(null)}
        paymentId={downloadPaymentId}
        autoDownload
      />

    </div>
  );
}
