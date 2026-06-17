import { useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Archive } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchVoided, type SoftDeletableTable } from '@/lib/clinic/softDelete';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';
import { formatQueueNo } from '@/lib/clinic/queueNumber';

const TABS: Array<{ key: SoftDeletableTable; label: string; entity: string }> = [
  { key: 'consultations', label: 'Consultations', entity: 'consultations' },
  { key: 'consultation_items', label: 'Items', entity: 'items' },
  { key: 'payments', label: 'Payments', entity: 'payments' },
  { key: 'queue_entries', label: 'Queue Entries', entity: 'queue entries' },
];

interface VoidedRow {
  id: string;
  deleted_at: string | null;
  deleted_by: string | null;
  [key: string]: unknown;
}

function VoidedTable({ table, entity }: { table: SoftDeletableTable; entity: string }) {
  const [rows, setRows] = useState<VoidedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchVoided(table).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data as VoidedRow[]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [table]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={cn(bento, 'border border-red-100')}>
        <CardContent className="py-4 text-sm text-red-700 bg-red-50 rounded-2xl">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className={cn(bento)}>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
            <Archive className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No voided {entity} yet.</p>
        </CardContent>
      </Card>
    );
  }

  const isQueueEntries = 'queue_sequence' in (rows[0] ?? {}) || 'queue_number' in (rows[0] ?? {});
  const labelKey =
    'item_name' in (rows[0] ?? {})
      ? 'item_name'
      : 'amount' in (rows[0] ?? {})
        ? 'amount'
        : isQueueEntries
          ? 'queue_sequence'
          : 'diagnosis_text' in (rows[0] ?? {})
            ? 'diagnosis_text'
            : 'id';

  return (
    <Card className={cn(bento, 'overflow-hidden')}>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">Voided {entity}</TableCaption>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100">
              {['Reference', 'Voided', 'By', 'Record ID'].map((h) => (
                <TableHead
                  key={h}
                  className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const ref = r[labelKey];
              const display = isQueueEntries
                ? formatQueueNo(
                    (r as { created_at?: string | null }).created_at ?? null,
                    (r as { queue_sequence?: number | null }).queue_sequence ?? null,
                  )
                : typeof ref === 'string' || typeof ref === 'number'
                  ? String(ref)
                  : '—';
              return (
                <TableRow
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                >
                  <TableCell className="max-w-xs truncate text-slate-800">
                    {display}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {r.deleted_at ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {formatDistanceToNow(new Date(r.deleted_at), { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(r.deleted_at), 'd MMM yyyy, HH:mm:ss')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {r.deleted_by ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{r.id}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function VoidedRecords() {
  return (
    <>
      <SEOHead
        title="Voided Records — Clinic Portal"
        description="Audit log of soft-deleted clinic records."
        noIndex
      />

      <div className={pageShell}>
        <div className={pageInner}>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Voided Records</h1>
            <p className="text-sm text-slate-500 mt-1">
              Read-only audit log. Only special admins can see voided rows.
            </p>
          </div>

          <Tabs defaultValue={TABS[0].key} className="w-full">
            <TabsList className="bg-transparent p-0 gap-2 h-auto flex-wrap justify-start mb-4">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="rounded-full px-3 py-1 text-xs font-medium bg-slate-50 text-slate-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((t) => (
              <TabsContent key={t.key} value={t.key}>
                <VoidedTable table={t.key} entity={t.entity} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </>
  );
}
