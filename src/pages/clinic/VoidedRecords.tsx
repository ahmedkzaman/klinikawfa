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
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Archive className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No voided {entity} yet.</p>
        </CardContent>
      </Card>
    );
  }

  // Pick a label column to show
  const labelKey =
    'item_name' in (rows[0] ?? {})
      ? 'item_name'
      : 'amount' in (rows[0] ?? {})
        ? 'amount'
        : 'queue_number' in (rows[0] ?? {})
          ? 'queue_number'
          : 'diagnosis_text' in (rows[0] ?? {})
            ? 'diagnosis_text'
            : 'id';

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">Voided {entity}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Voided</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Record ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const ref = r[labelKey];
              return (
                <TableRow key={r.id}>
                  <TableCell className="max-w-xs truncate">
                    {typeof ref === 'string' || typeof ref === 'number' ? String(ref) : '—'}
                  </TableCell>
                  <TableCell>
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
                  <TableCell className="font-mono text-xs">
                    {r.deleted_by ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
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

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Voided Records</h1>
        <p className="text-sm text-muted-foreground">
          Read-only audit log. Only special admins can see voided rows.
        </p>
      </div>

      <Tabs defaultValue={TABS[0].key} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
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
    </>
  );
}
