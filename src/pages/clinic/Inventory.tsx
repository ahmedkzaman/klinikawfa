import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

interface InventoryRow {
  id: string;
  name: string;
  category: string;
  unit_of_measure: string | null;
  stock: number;
  allocated_quantity: number;
  status: string;
}

function useInventoryItems() {
  return useQuery<InventoryRow[]>({
    queryKey: ['clinic', 'inventory-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, category, unit_of_measure, stock, allocated_quantity, status')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as InventoryRow[];
    },
    staleTime: 30_000,
  });
}

export default function Inventory() {
  const { data: items = [], isLoading } = useInventoryItems();

  return (
    <>
      <SEOHead
        title="Inventory — Clinic Portal"
        description="Stock and allocation overview."
        noIndex
      />

      <div className={pageShell}>
        <div className={pageInner}>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
            <p className="text-sm text-slate-500 mt-1">
              Read-only stock view. Full CRUD comes in a later step.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card className={cn(bento)}>
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                  <Package className="h-7 w-7 text-blue-600" />
                </div>
                <p className="text-sm text-slate-500">No inventory items yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className={cn(bento, 'overflow-hidden')}>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">Inventory stock and allocation</TableCaption>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100">
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Item
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Category
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Stock
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Allocated
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                        Available
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => {
                      const available = Math.max(it.stock - it.allocated_quantity, 0);
                      const lowStock = available === 0;
                      return (
                        <TableRow
                          key={it.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                        >
                          <TableCell className="font-medium text-slate-800">
                            {it.name}
                            {it.unit_of_measure && (
                              <span className="text-xs text-slate-500 ml-1">
                                / {it.unit_of_measure}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-500">{it.category}</TableCell>
                          <TableCell className="text-right tabular-nums text-slate-700">
                            {it.stock}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-slate-500">
                            {it.allocated_quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge
                              className={cn(
                                'tabular-nums rounded-full border-none font-semibold',
                                lowStock
                                  ? 'bg-red-50 text-red-700 hover:bg-red-50'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
                              )}
                            >
                              {available}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
