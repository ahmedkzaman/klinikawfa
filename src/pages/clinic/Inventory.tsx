import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, Plus, Pill, ClipboardList, Boxes, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ItemBatchesSheet } from '@/components/clinic/inventory/ItemBatchesSheet';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';
import {
  ItemEditSheet,
  type InventoryDashboardRow,
} from '@/components/clinic/inventory/ItemEditSheet';
import { PackagesPanel } from '@/components/clinic/inventory/PackagesPanel';
import { StockTakePanel } from '@/components/clinic/inventory/StockTakePanel';

type SubNav = 'item_master' | 'stock_take' | 'packages';
type TabKey = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring' | 'archived';

const fmtRM = (n: number) =>
  `RM ${(Number(n) || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function useInventoryDashboard() {
  return useQuery<InventoryDashboardRow[]>({
    queryKey: ['clinic', 'inventory-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(
          'id, name, category, stock, stock_amount_warning, price_to_patient_max, price_tier_1, price_tier_2, nearest_expiry_date, archived_at, groups, default_dosage_qty, default_dosage_unit, default_frequency, default_duration, default_duration_unit, default_instruction, default_precaution, status',
        )
        .order('name', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as InventoryDashboardRow[];
    },
    staleTime: 30_000,
  });
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

function classify(item: InventoryDashboardRow): Set<TabKey> {
  const tags = new Set<TabKey>();
  if (item.archived_at) {
    tags.add('archived');
    return tags;
  }
  tags.add('all');
  const threshold = Number(item.stock_amount_warning ?? 0);
  if (item.stock <= 0) tags.add('out_of_stock');
  else if (item.stock <= threshold) tags.add('low_stock');
  else tags.add('in_stock');

  if (item.nearest_expiry_date) {
    const t = new Date(item.nearest_expiry_date).getTime();
    if (!Number.isNaN(t) && t - Date.now() <= SIXTY_DAYS_MS) tags.add('expiring');
  }
  return tags;
}

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  expiring: 'Expiring Soon',
  archived: 'Archived',
};

export default function Inventory() {
  const { data: items = [], isLoading } = useInventoryDashboard();
  const [subNav, setSubNav] = useState<SubNav>('item_master');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [editTarget, setEditTarget] = useState<InventoryDashboardRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchesTarget, setBatchesTarget] = useState<InventoryDashboardRow | null>(null);
  const [search, setSearch] = useState('');

  const searchedItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.name, it.category, ...(Array.isArray(it.groups) ? it.groups : [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const tagged = useMemo(
    () => searchedItems.map((it) => ({ item: it, tags: classify(it) })),
    [searchedItems],
  );

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0, expiring: 0, archived: 0,
    };
    for (const { tags } of tagged) {
      tags.forEach((t) => { c[t]++; });
    }
    return c;
  }, [tagged]);

  const filtered = useMemo(
    () => tagged.filter(({ tags }) => tags.has(activeTab)).map((t) => t.item),
    [tagged, activeTab],
  );

  const openEdit = (row: InventoryDashboardRow) => {
    setEditTarget(row);
    setSheetOpen(true);
  };

  const openAdd = () => {
    setEditTarget(null);
    setSheetOpen(true);
  };

  return (
    <>
      <SEOHead title="Inventory — Clinic Portal" description="Stock and pricing management." noIndex />

      <div className={pageShell}>
        <div className={pageInner}>
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage stock, expiry, and pricing tiers for medications and supplies.
              </p>
            </div>
            {subNav === 'item_master' && (
              <Button onClick={openAdd} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Item
              </Button>
            )}
          </div>

          {/* Sub-nav pills */}
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'item_master', label: 'Item Master', icon: Package },
              { key: 'stock_take', label: 'Stock Take', icon: ClipboardList },
              { key: 'packages', label: 'Packages', icon: Boxes },
            ] as const).map((p) => {
              const Icon = p.icon;
              const active = subNav === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSubNav(p.key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Sub-nav content */}
          {subNav === 'packages' ? (
            <PackagesPanel />
          ) : subNav === 'stock_take' ? (
            <StockTakePanel />
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
              <TabsList className="flex-wrap h-auto">
                {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
                  <TabsTrigger key={key} value={key} className="gap-1.5">
                    {TAB_LABELS[key]}
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] tabular-nums"
                    >
                      {counts[key]}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={activeTab} className="mt-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-xl" />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <Card className={cn(bento)}>
                    <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                        <Pill className="h-7 w-7 text-blue-600" />
                      </div>
                      <p className="text-sm text-slate-500">
                        No items in <strong>{TAB_LABELS[activeTab]}</strong>.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className={cn(bento, 'overflow-hidden')}>
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-100">
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Item</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Category</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right">Stock</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right">Low-Stock Alert</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right">Base Price</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Expiry</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase">Status</TableHead>
                            <TableHead className="text-[11px] font-semibold text-slate-500 uppercase text-right">Batches</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((it) => {
                            const threshold = Number(it.stock_amount_warning ?? 0);
                            const lowStock = it.stock > 0 && it.stock <= threshold;
                            const out = it.stock <= 0;
                            const archived = !!it.archived_at;
                            return (
                              <TableRow
                                key={it.id}
                                onClick={() => openEdit(it)}
                                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                              >
                                <TableCell className="font-medium text-slate-800">{it.name}</TableCell>
                                <TableCell className="text-slate-500">{it.category}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-700">{it.stock}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-500">{threshold}</TableCell>
                                <TableCell className="text-right tabular-nums text-slate-700">
                                  {fmtRM(it.price_to_patient_max)}
                                </TableCell>
                                <TableCell className="text-slate-500">
                                  {it.nearest_expiry_date ?? '—'}
                                </TableCell>
                                <TableCell>
                                  {archived ? (
                                    <Badge variant="secondary">Archived</Badge>
                                  ) : out ? (
                                    <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-none">Out of Stock</Badge>
                                  ) : lowStock ? (
                                    <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-none">Low Stock</Badge>
                                  ) : (
                                    <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-none">In Stock</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setBatchesTarget(it)}
                                  >
                                    <Boxes className="h-3.5 w-3.5 mr-1" />
                                    Batches
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      <ItemEditSheet open={sheetOpen} onOpenChange={setSheetOpen} item={editTarget} />
      <ItemBatchesSheet
        open={!!batchesTarget}
        onOpenChange={(v) => { if (!v) setBatchesTarget(null); }}
        itemId={batchesTarget?.id ?? null}
        itemName={batchesTarget?.name ?? null}
      />
    </>
  );
}
