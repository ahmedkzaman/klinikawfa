import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProcurementLogicSheet, type LogicSection } from '@/components/clinic/procurement/ProcurementLogicSheet';
import { POSheet } from '@/components/clinic/procurement/POSheet';
import { usePurchaseOrders } from '@/hooks/clinic/usePurchaseOrders';
import { useSuppliers } from '@/hooks/clinic/useSuppliers';
import { OverviewTab } from '@/components/clinic/procurement/dashboard/OverviewTab';
import { LedgerTab } from '@/components/clinic/procurement/dashboard/LedgerTab';
import { CorrelationTab } from '@/components/clinic/procurement/dashboard/CorrelationTab';
import { PlanningTab } from '@/components/clinic/procurement/dashboard/PlanningTab';

const dashboardTabs = ['planning', 'overview', 'ledger', 'correlation'] as const;
type DashboardTab = typeof dashboardTabs[number];

export default function ProcurementDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: DashboardTab = dashboardTabs.includes(tabParam as DashboardTab)
    ? tabParam as DashboardTab
    : 'planning';

  // Logic sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState<LogicSection>('correlation');
  const [poSheet, setPOSheet] = useState<{ open: boolean; poId: string | null }>({ open: false, poId: null });
  const [draftingItemId, setDraftingItemId] = useState<string | null>(null);
  const { suppliers } = useSuppliers();
  const { createDraft } = usePurchaseOrders();

  const updateParam = (key: string, value: string, defaultValue?: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const openSheet = (section: LogicSection) => {
    setSheetSection(section);
    setSheetOpen(true);
  };

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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6" /> Procurement Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Live movement classification driven by the dispensing ledger.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => updateParam('tab', value, 'planning')} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="planning">Purchase Planning</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="ledger">Movement Ledger</TabsTrigger>
            <TabsTrigger value="correlation">Diagnosis Correlation</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="planning">
          <PlanningTab
            onOpenLogic={() => openSheet('planning')}
            onDraftPO={draftRecommendedPO}
            draftingItemId={draftingItemId}
          />
        </TabsContent>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerTab />
        </TabsContent>

        <TabsContent value="correlation">
          <CorrelationTab onOpenLogic={() => openSheet('correlation')} />
        </TabsContent>
      </Tabs>

      <ProcurementLogicSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        defaultSection={sheetSection}
      />
      <POSheet
        open={poSheet.open}
        poId={poSheet.poId}
        onOpenChange={(open) => setPOSheet({ open, poId: open ? poSheet.poId : null })}
      />
    </div>
  );
}
