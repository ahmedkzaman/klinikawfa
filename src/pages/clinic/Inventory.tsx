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

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Read-only stock view. Full CRUD comes in a later step.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No inventory items yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">Inventory stock and allocation</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const available = Math.max(it.stock - it.allocated_quantity, 0);
                  const lowStock = available === 0;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.name}
                        {it.unit_of_measure && (
                          <span className="text-xs text-muted-foreground ml-1">
                            / {it.unit_of_measure}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{it.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{it.stock}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {it.allocated_quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant="outline"
                          className={cn(
                            'tabular-nums',
                            lowStock
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : 'bg-primary/10 text-primary border-primary/20',
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
    </>
  );
}
