import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useReconcileStock } from '@/hooks/clinic/useInventoryAdjustments';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StockRow {
  id: string;
  name: string;
  category: string | null;
  stock: number;
}

function useStockTakeItems() {
  return useQuery({
    queryKey: ['stock_take_items'],
    queryFn: async (): Promise<StockRow[]> => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, category, stock, status, archived_at')
        .order('name')
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<StockRow & { status: string; archived_at: string | null }>)
        .filter((it) => it.status === 'active' && !it.archived_at)
        .map((it) => ({ id: it.id, name: it.name, category: it.category, stock: Number(it.stock) || 0 }));
    },
  });
}

export function StockTakePanel() {
  const { data: items = [], isLoading, refetch } = useStockTakeItems();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const reconcile = useReconcileStock();

  const changes = useMemo(() => {
    const out: { id: string; previous: number; next: number; variance: number }[] = [];
    for (const it of items) {
      const raw = counts[it.id];
      if (raw === undefined || raw === '') continue;
      const next = Number(raw);
      if (Number.isNaN(next)) continue;
      if (next === it.stock) continue;
      out.push({ id: it.id, previous: it.stock, next, variance: next - it.stock });
    }
    return out;
  }, [counts, items]);

  const onReconcile = async () => {
    if (changes.length === 0) return;
    if (!confirm(`Reconcile ${changes.length} item(s)? This will update stock and log adjustments.`)) return;
    try {
      await reconcile.mutateAsync({
        changes: changes.map((c) => ({
          inventory_item_id: c.id,
          previous_stock: c.previous,
          new_stock: c.next,
        })),
        reason: reason.trim() || null,
      });
      toast.success(`Reconciled ${changes.length} item(s)`);
      setCounts({});
      setReason('');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            <h3 className="font-semibold text-slate-800">Stock Take · Reconciliation</h3>
          </div>
          <span className={cn(
            'text-xs rounded-full px-3 py-1 font-medium',
            changes.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500',
          )}>
            {changes.length} pending change{changes.length === 1 ? '' : 's'}
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No active inventory items.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[55vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-50 z-10">
                <TableRow className="hover:bg-slate-50">
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Item</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Category</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right">System Stock</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase w-40">Physical Count</TableHead>
                  <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right w-28">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const raw = counts[it.id];
                  const next = raw === '' || raw === undefined ? null : Number(raw);
                  const variance = next === null || Number.isNaN(next) ? null : next - it.stock;
                  return (
                    <TableRow key={it.id} className="border-b border-slate-100">
                      <TableCell className="font-medium text-slate-800">{it.name}</TableCell>
                      <TableCell className="text-slate-500">{it.category ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-700">{it.stock}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={raw ?? ''}
                          placeholder={String(it.stock)}
                          onChange={(e) =>
                            setCounts((prev) => ({ ...prev, [it.id]: e.target.value }))
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className={cn(
                        'text-right tabular-nums font-medium',
                        variance === null ? 'text-slate-300'
                          : variance < 0 ? 'text-red-600'
                          : variance > 0 ? 'text-emerald-600'
                          : 'text-slate-400',
                      )}>
                        {variance === null ? '—' : (variance > 0 ? `+${variance}` : variance)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/40">
          <div className="space-y-1.5">
            <Label className="text-xs">Reason / Notes (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Monthly stock take, expired stock disposal…"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={onReconcile}
              disabled={changes.length === 0 || reconcile.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {reconcile.isPending
                ? 'Reconciling…'
                : `Reconcile (${changes.length})`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
