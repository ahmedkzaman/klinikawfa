import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { ExternalLink, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  bento,
  pageInner,
  pageShell,
  softInput,
} from '@/lib/clinic/bentoTokens';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentsLedger } from '@/hooks/clinic/usePayments';
import type { ConsultationRow, ConsultationItemRow } from '@/types/clinic';

type TabKey = 'paid' | 'panel' | 'self_pay';

interface LedgerEntry {
  queueEntryId: string;
  queueNumber: number | null;
  patientName: string;
  createdAt: string;
  clinicStatus: string;
  subtotal: number;
  paid: number;
  outstanding: number;
  latestPaymentType: 'self_pay' | 'panel' | 'insurance';
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'paid', label: 'Paid' },
  { key: 'panel', label: 'Outstanding Panel' },
  { key: 'self_pay', label: 'Outstanding Self-Pay' },
];

export default function Billings() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<string>(
    format(subDays(today, 30), 'yyyy-MM-dd'),
  );
  const [to, setTo] = useState<string>(format(today, 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState<TabKey>('paid');

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

      const { data: items, error: iErr } = await supabase
        .from('consultation_items')
        .select('consultation_id, price, quantity')
        .in('consultation_id', consultationIds)
        .is('deleted_at', null);
      if (iErr) throw iErr;

      const totalsByConsultation: Record<string, number> = {};
      (items ?? []).forEach(
        (it: Pick<ConsultationItemRow, 'consultation_id' | 'price' | 'quantity'>) => {
          totalsByConsultation[it.consultation_id] =
            (totalsByConsultation[it.consultation_id] ?? 0) +
            Number(it.price ?? 0) * Number(it.quantity ?? 0);
        },
      );

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
      } else {
        byQueue.set(qe.id, {
          queueEntryId: qe.id,
          queueNumber: qe.queue_number,
          patientName: qe.patients?.name ?? '—',
          createdAt: qe.created_at,
          clinicStatus: qe.clinic_status,
          subtotal: itemsByQueue[qe.id] ?? 0,
          paid: amt,
          outstanding: 0,
          latestPaymentType: pType,
        });
      }
    }

    const list = Array.from(byQueue.values());
    list.forEach((e) => {
      e.outstanding = Math.max(e.subtotal - e.paid, 0);
    });
    return list;
  }, [ledger, itemsByQueue]);

  const filtered = useMemo(() => {
    if (activeTab === 'paid') {
      return entries.filter(
        (e) => e.outstanding <= 0 && e.clinicStatus === 'completed',
      );
    }
    if (activeTab === 'panel') {
      return entries.filter(
        (e) =>
          e.outstanding > 0 &&
          (e.latestPaymentType === 'panel' ||
            e.latestPaymentType === 'insurance'),
      );
    }
    return entries.filter(
      (e) => e.outstanding > 0 && e.latestPaymentType === 'self_pay',
    );
  }, [entries, activeTab]);

  const counts = useMemo(
    () => ({
      paid: entries.filter(
        (e) => e.outstanding <= 0 && e.clinicStatus === 'completed',
      ).length,
      panel: entries.filter(
        (e) =>
          e.outstanding > 0 &&
          (e.latestPaymentType === 'panel' ||
            e.latestPaymentType === 'insurance'),
      ).length,
      self_pay: entries.filter(
        (e) => e.outstanding > 0 && e.latestPaymentType === 'self_pay',
      ).length,
    }),
    [entries],
  );

  const isLoading = ledgerLoading || itemsLoading;

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        {/* Header bar */}
        <div className={cn(bento, 'p-4 flex items-end justify-between gap-4 flex-wrap')}>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Billings</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Financial overview for self-pay and panel claims.
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

        <div className={cn(bento, 'overflow-hidden')}>
          <div className="grid grid-cols-[80px_1fr_140px_100px_100px_100px_80px] gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            {['QUEUE', 'PATIENT', 'DATE', 'SUBTOTAL', 'PAID', 'OUTSTANDING', ''].map((col) => (
              <span
                key={col}
                className="text-[11px] font-bold text-slate-500 uppercase tracking-wider"
              >
                {col}
              </span>
            ))}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Receipt className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium text-slate-600">No entries in this view</p>
              <p className="text-xs mt-1 text-slate-500">
                Try adjusting the date range or switch tabs.
              </p>
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.queueEntryId}
                className="grid grid-cols-[80px_1fr_140px_100px_100px_100px_80px] gap-2 px-4 py-3 border-b border-slate-100 last:border-0 items-center hover:bg-slate-50/60 transition-colors"
              >
                <span className="text-sm tabular-nums text-slate-600">
                  #{e.queueNumber ?? '—'}
                </span>
                <span className="text-sm font-medium text-slate-800 truncate">
                  {e.patientName}
                </span>
                <span className="text-xs text-slate-500">
                  {format(new Date(e.createdAt), 'd MMM, h:mm a')}
                </span>
                <span className="text-sm tabular-nums text-slate-600">
                  RM {e.subtotal.toFixed(2)}
                </span>
                <span className="text-sm tabular-nums text-slate-600">
                  RM {e.paid.toFixed(2)}
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    e.outstanding > 0 ? 'text-rose-600 font-semibold' : 'text-slate-600',
                  )}
                >
                  RM {e.outstanding.toFixed(2)}
                </span>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
