import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInventoryItems } from '@/hooks/clinic/useInventoryItems';
import { useServices } from '@/hooks/clinic/useServices';
import { usePackages } from '@/hooks/clinic/usePackages';
import {
  InventoryItemDialog,
  type InventoryItemRow,
  type InventoryCategory,
} from '@/components/clinic/settings/InventoryItemDialog';
import {
  ServiceDialog,
  type ServiceRow,
  type ServiceCategory,
} from '@/components/clinic/settings/ServiceDialog';
import {
  PackageDialog,
  type PackageRow,
} from '@/components/clinic/settings/PackageDialog';

const fmtRM = (n: number) =>
  `RM ${(Number(n) || 0).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type ItemTabKey = 'medications' | 'disposables';
type SvcTabKey = 'procedures' | 'labs' | 'general_services';
type TabKey = ItemTabKey | SvcTabKey | 'packages';

const ITEM_TAB_DEFAULTS: Record<ItemTabKey, InventoryCategory> = {
  medications: 'Medication',
  disposables: 'Disposable Item',
};

const SVC_TAB_DEFAULTS: Record<SvcTabKey, ServiceCategory> = {
  procedures: 'Procedure',
  labs: 'Laboratory Investigation',
  general_services: 'General Service',
};

export default function InventorySettings() {
  const { items, isLoading: itemsLoading } = useInventoryItems();
  const { services, isLoading: servicesLoading } = useServices();
  const { packages, isLoading: packagesLoading } = usePackages();

  const [activeTab, setActiveTab] = useState<TabKey>('medications');

  const [itemDialog, setItemDialog] = useState<{
    open: boolean;
    row: InventoryItemRow | null;
    defaultCategory?: InventoryCategory;
  }>({ open: false, row: null });

  const [serviceDialog, setServiceDialog] = useState<{
    open: boolean;
    row: ServiceRow | null;
    defaultCategory?: ServiceCategory;
  }>({ open: false, row: null });

  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; row: PackageRow | null }>({
    open: false,
    row: null,
  });

  // ── Filtered slices ────────────────────────────────────────────
  const medications = useMemo(
    () =>
      items.filter((it) => {
        const c = (it as { category?: string | null }).category ?? 'Medication';
        return c === 'Medication' || c === 'Vaccine';
      }),
    [items],
  );

  const disposables = useMemo(
    () =>
      items.filter(
        (it) => (it as { category?: string | null }).category === 'Disposable Item',
      ),
    [items],
  );

  const procedures = useMemo(
    () =>
      services.filter(
        (s) => (s as { category?: string | null }).category === 'Procedure',
      ),
    [services],
  );

  const labs = useMemo(
    () =>
      services.filter(
        (s) =>
          (s as { category?: string | null }).category === 'Laboratory Investigation',
      ),
    [services],
  );

  const generalServices = useMemo(
    () =>
      services.filter((s) => {
        const c = (s as { category?: string | null }).category ?? 'General Service';
        return c === 'General Service' || c === 'Other';
      }),
    [services],
  );

  // ── Helpers ────────────────────────────────────────────────────
  const buildItemRow = (it: (typeof items)[number]): InventoryItemRow => ({
    id: it.id,
    name: it.name,
    cost_price: Number(it.cost_price) || 0,
    price_to_patient_max: Number(it.price_to_patient_max) || 0,
    standard_panel_price:
      Number((it as { standard_panel_price?: number | null }).standard_panel_price) || 0,
    stock: Number(it.stock) || 0,
    status: it.status,
    category: (it as { category?: string | null }).category ?? 'Medication',
    default_indication: (it as { default_indication?: string | null }).default_indication ?? null,
    default_dosage_qty: (it as { default_dosage_qty?: string | null }).default_dosage_qty ?? null,
    default_dosage_unit: (it as { default_dosage_unit?: string | null }).default_dosage_unit ?? null,
    default_frequency: (it as { default_frequency?: string | null }).default_frequency ?? null,
    default_instruction: (it as { default_instruction?: string | null }).default_instruction ?? null,
    default_duration: (it as { default_duration?: string | null }).default_duration ?? null,
    default_duration_unit: (it as { default_duration_unit?: string | null }).default_duration_unit ?? null,
    default_precaution: (it as { default_precaution?: string | null }).default_precaution ?? null,
  });

  const buildServiceRow = (s: (typeof services)[number]): ServiceRow => ({
    id: s.id,
    name: s.name,
    cost: Number(s.cost) || 0,
    price_to_patient: Number(s.price_to_patient) || 0,
    standard_panel_price:
      Number((s as { standard_panel_price?: number | null }).standard_panel_price) || 0,
    status: s.status,
    category: (s as { category?: string | null }).category ?? 'General Service',
  });

  const openAddItem = (cat: InventoryCategory) =>
    setItemDialog({ open: true, row: null, defaultCategory: cat });

  const openAddService = (cat: ServiceCategory) =>
    setServiceDialog({ open: true, row: null, defaultCategory: cat });

  // ── Reusable table renderers ───────────────────────────────────
  const renderItemTable = (
    rows: typeof items,
    loading: boolean,
    emptyHint: string,
  ) => (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Cost (RM)</TableHead>
            <TableHead className="text-right">Selling (RM)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                {emptyHint}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {(it as { category?: string | null }).category ?? 'Medication'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{it.stock}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtRM(it.cost_price)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtRM(it.price_to_patient_max)}
                </TableCell>
                <TableCell>
                  <Badge variant={it.status === 'active' ? 'default' : 'secondary'}>
                    {it.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setItemDialog({ open: true, row: buildItemRow(it) })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );

  const renderServiceTable = (
    rows: typeof services,
    loading: boolean,
    emptyHint: string,
  ) => (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Cost (RM)</TableHead>
            <TableHead className="text-right">Price (RM)</TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                {emptyHint}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {(s as { category?: string | null }).category ?? 'General Service'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtRM(s.cost)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtRM(s.price_to_patient)}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setServiceDialog({ open: true, row: buildServiceRow(s) })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link to="/clinic/settings">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory & Services</h1>
          <p className="text-sm text-muted-foreground">
            Manage practice items, services, packages, and pricing.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="medications">Medications</TabsTrigger>
          <TabsTrigger value="disposables">Disposables</TabsTrigger>
          <TabsTrigger value="procedures">Procedures</TabsTrigger>
          <TabsTrigger value="labs">Lab Investigations</TabsTrigger>
          <TabsTrigger value="general_services">General Services</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        {/* MEDICATIONS (Medication + Vaccine) */}
        <TabsContent value="medications" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openAddItem(ITEM_TAB_DEFAULTS.medications)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Medication
            </Button>
          </div>
          {renderItemTable(
            medications,
            itemsLoading,
            'No medications yet. Click "Add Medication" to create one.',
          )}
        </TabsContent>

        {/* DISPOSABLES */}
        <TabsContent value="disposables" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openAddItem(ITEM_TAB_DEFAULTS.disposables)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Disposable
            </Button>
          </div>
          {renderItemTable(
            disposables,
            itemsLoading,
            'No disposable items yet. Click "Add Disposable" to create one.',
          )}
        </TabsContent>

        {/* PROCEDURES */}
        <TabsContent value="procedures" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openAddService(SVC_TAB_DEFAULTS.procedures)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Procedure
            </Button>
          </div>
          {renderServiceTable(
            procedures,
            servicesLoading,
            'No procedures yet. Click "Add Procedure" to create one.',
          )}
        </TabsContent>

        {/* LAB INVESTIGATIONS */}
        <TabsContent value="labs" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openAddService(SVC_TAB_DEFAULTS.labs)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Lab Investigation
            </Button>
          </div>
          {renderServiceTable(
            labs,
            servicesLoading,
            'No lab investigations yet. Click "Add Lab Investigation" to create one.',
          )}
        </TabsContent>

        {/* GENERAL SERVICES (General Service + Other) */}
        <TabsContent value="general_services" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openAddService(SVC_TAB_DEFAULTS.general_services)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Service
            </Button>
          </div>
          {renderServiceTable(
            generalServices,
            servicesLoading,
            'No general services yet. Click "Add Service" to create one.',
          )}
        </TabsContent>

        {/* PACKAGES */}
        <TabsContent value="packages" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPkgDialog({ open: true, row: null })}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Package
            </Button>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Cost (RM)</TableHead>
                  <TableHead className="text-right">Price (RM)</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {packagesLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : packages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No packages yet. Click "Add Package" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  packages.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRM(p.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRM(p.price)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setPkgDialog({
                              open: true,
                              row: {
                                id: p.id,
                                name: p.name,
                                cost: Number(p.cost) || 0,
                                price: Number(p.price) || 0,
                                standard_panel_price:
                                  Number((p as { standard_panel_price?: number }).standard_panel_price) || 0,
                                status: p.status,
                              },
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <InventoryItemDialog
        open={itemDialog.open}
        onOpenChange={(o) => setItemDialog((s) => ({ ...s, open: o }))}
        item={itemDialog.row}
        defaultCategory={itemDialog.defaultCategory}
      />
      <ServiceDialog
        open={serviceDialog.open}
        onOpenChange={(o) => setServiceDialog((s) => ({ ...s, open: o }))}
        service={serviceDialog.row}
        defaultCategory={serviceDialog.defaultCategory}
      />
      <PackageDialog
        open={pkgDialog.open}
        onOpenChange={(o) => setPkgDialog((s) => ({ ...s, open: o }))}
        pkg={pkgDialog.row}
      />
    </div>
  );
}
