import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Activity, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProcurementLogicSheet, type LogicSection } from '@/components/clinic/procurement/ProcurementLogicSheet';
import { POSheet } from '@/components/clinic/procurement/POSheet';
import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';
import { useProcurementAccess } from '@/hooks/clinic/useProcurementDashboard';
import { CommandOverviewTab } from '@/components/clinic/procurement/dashboard/CommandOverviewTab';
import { StockPlanningTab } from '@/components/clinic/procurement/dashboard/StockPlanningTab';
import { OrdersTab } from '@/components/clinic/procurement/dashboard/OrdersTab';
import { AnalysisTab } from '@/components/clinic/procurement/dashboard/AnalysisTab';

type PrimaryTab = 'overview' | 'stock' | 'orders';
const primaryTabs: PrimaryTab[] = ['overview', 'stock', 'orders'];

const TAB_LABELS: Record<PrimaryTab, string> = {
  overview: 'Overview',
  stock: 'Stock Planning',
  orders: 'Orders',
};

function monthStart(d: Date): string {
  return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return format(new Date(y, m - 1 + delta, 1), 'yyyy-MM-dd');
}

export function ProcurementDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: PrimaryTab = primaryTabs.includes(tabParam as PrimaryTab)
    ? (tabParam as PrimaryTab)
    : 'overview';
  const month = searchParams.get('month') ?? monthStart(new Date());
  const analysisParam = searchParams.get('analysis');

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [logicOpen, setLogicOpen] = useState(false);
  const [logicSection, setLogicSection] = useState<LogicSection>('correlation');
  const [poSheet, setPOSheet] = useState<{ open: boolean; poId: string | null }>({ open: false, poId: null });
  const [draftingItemId, setDraftingItemId] = useState<string | null>(null);
  const { suppliers } = useSuppliers();
  const { createDraft } = usePurchaseOrders();
  const { canApprove } = useProcurementAccess();

  // Deep link: ?analysis=ledger opens the Analysis workspace directly.
  useEffect(() => {
    if (analysisParam) setAnalysisOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateParams = (updates: Array<[string, string | null]>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of updates) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const setTab = (tab: PrimaryTab) => updateParams([['tab', tab === 'overview' ? null : tab]]);
  const setMonth = (m: string) => updateParams([['month', m === monthStart(new Date()) ? null : m]]);

  const openAnalysis = (section: 'movement' | 'ledger' | 'correlation') => {
    updateParams([['tab', 'overview'], ['analysis', section === 'movement' ? null : section]]);
    setAnalysisOpen(true);
  };

  const openLogic = (section: 'correlation' | 'planning') => {
    setLogicSection(section as LogicSection);
    setLogicOpen(true);
  };

  const openPO = (poId: string) => setPOSheet({ open: true, poId });

  const draftRecommendedPO = async (itemId: string, qty: number) => {
    if (!suppliers.some((supplier) => supplier.status === 'active')) {
      toast.error('Add an active supplier before creating a purchase order.');
      return;
    }
    setDraftingItemId(itemId);
    try {
      const draft = await createDraft.mutateAsync({ inventory_item_id: itemId, order_qty: qty });
      setPOSheet({ open: true, poId: draft.id });
      toast.success('Draft PO created with the recommended item and quantity.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not create the draft PO.');
    } finally {
      setDraftingItemId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-[1400px] py-4 sm:py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Procurement Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Budgets, stock planning, and orders in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnalysisOpen(true)}>
            <Layers className="h-4 w-4 mr-1" /> Analysis
          </Button>
          <div className="flex items-center rounded-md border" aria-label="Month selector">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth(shiftMonth(month, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[7rem] text-center text-sm font-medium">
              {format(new Date(`${month}T00:00:00`), 'MMMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth(shiftMonth(month, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Procurement sections" className="flex gap-1 overflow-x-auto pb-1">
        {primaryTabs.map((tab) => (
          <Button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            variant={activeTab === tab ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTab(tab)}
          >
            {TAB_LABELS[tab]}
          </Button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TAB_LABELS[activeTab]}>
        {activeTab === 'overview' && (
          <CommandOverviewTab
            month={month}
            onMonthChange={setMonth}
            onOpenPO={openPO}
            onCreateOrder={() => setTab('stock')}
            canApprove={canApprove}
          />
        )}
        {activeTab === 'stock' && (
          <StockPlanningTab onDraftPO={draftRecommendedPO} draftingItemId={draftingItemId} />
        )}
        {activeTab === 'orders' && (
          <OrdersTab onOpenPO={openPO} onAddPO={draftRecommendedPO as never} />
        )}
      </div>

      {/* Secondary Analysis workspace */}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Analysis</DialogTitle>
            <DialogDescription>
              Detailed inventory movement, ledger, and correlation tools.
            </DialogDescription>
          </DialogHeader>
          <AnalysisTab onOpenLogic={openLogic} />
        </DialogContent>
      </Dialog>

      <ProcurementLogicSheet
        open={logicOpen}
        onOpenChange={setLogicOpen}
        defaultSection={logicSection}
      />
      <POSheet
        open={poSheet.open}
        poId={poSheet.poId}
        onOpenChange={(open) => setPOSheet({ open, poId: open ? poSheet.poId : null })}
        canApprove={canApprove}
      />
    </div>
  );
}

export default ProcurementDashboard;
