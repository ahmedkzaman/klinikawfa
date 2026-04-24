import { useState } from 'react';
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
} from '@/components/clinic/settings/InventoryItemDialog';
import {
  ServiceDialog,
  type ServiceRow,
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

export default function InventorySettings() {
  const { items, isLoading: itemsLoading } = useInventoryItems();
  const { services, isLoading: servicesLoading } = useServices();
  const { packages, isLoading: packagesLoading } = usePackages();

  const [itemDialog, setItemDialog] = useState<{ open: boolean; row: InventoryItemRow | null }>({
    open: false,
    row: null,
  });
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; row: ServiceRow | null }>({
    open: false,
    row: null,
  });
  const [pkgDialog, setPkgDialog] = useState<{ open: boolean; row: PackageRow | null }>({
    open: false,
    row: null,
  });

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

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Medications & Items</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        {/* ITEMS */}
        <TabsContent value="items" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setItemDialog({ open: true, row: null })}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Item
            </Button>
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Cost Price (RM)</TableHead>
                  <TableHead className="text-right">Selling Price (RM)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No items yet. Click "Add Item" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.name}</TableCell>
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
                            setItemDialog({
                              open: true,
                              row: {
                                id: it.id,
                                name: it.name,
                                cost_price: Number(it.cost_price) || 0,
                                price_to_patient_max: Number(it.price_to_patient_max) || 0,
                                stock: Number(it.stock) || 0,
                                status: it.status,
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

        {/* SERVICES */}
        <TabsContent value="services" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setServiceDialog({ open: true, row: null })}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Service
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
                {servicesLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No services yet. Click "Add Service" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRM(s.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtRM(s.price_to_patient)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setServiceDialog({
                              open: true,
                              row: {
                                id: s.id,
                                name: s.name,
                                cost: Number(s.cost) || 0,
                                price_to_patient: Number(s.price_to_patient) || 0,
                                status: s.status,
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
      />
      <ServiceDialog
        open={serviceDialog.open}
        onOpenChange={(o) => setServiceDialog((s) => ({ ...s, open: o }))}
        service={serviceDialog.row}
      />
      <PackageDialog
        open={pkgDialog.open}
        onOpenChange={(o) => setPkgDialog((s) => ({ ...s, open: o }))}
        pkg={pkgDialog.row}
      />
    </div>
  );
}
