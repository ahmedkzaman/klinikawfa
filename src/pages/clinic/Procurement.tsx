import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Package, Building2, Receipt } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSuppliers, type Supplier } from '@/hooks/clinic/useSuppliers';
import { usePurchaseOrders, type POStatus } from '@/hooks/clinic/usePurchaseOrders';
import { SupplierDialog } from '@/components/clinic/procurement/SupplierDialog';
import { POSheet } from '@/components/clinic/procurement/POSheet';
import { toast } from 'sonner';

const statusBadge: Record<POStatus, string> = {
  Draft:     'bg-muted text-muted-foreground',
  Sent:      'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  Received:  'bg-green-500/15 text-green-700 dark:text-green-400',
  Cancelled: 'bg-destructive/15 text-destructive',
};

export default function Procurement() {
  const { suppliers, isLoading: suppliersLoading } = useSuppliers();
  const { orders, isLoading: ordersLoading, createDraft } = usePurchaseOrders();

  const [supplierDialog, setSupplierDialog] = useState<{ open: boolean; supplier: Supplier | null }>({
    open: false,
    supplier: null,
  });
  const [poSheet, setPOSheet] = useState<{ open: boolean; poId: string | null }>({
    open: false,
    poId: null,
  });

  const onAddPO = async () => {
    if (!suppliers.some((s) => s.status === 'active')) {
      toast.error('Add an active supplier before creating a PO.');
      return;
    }
    try {
      const res = await createDraft.mutateAsync({});
      setPOSheet({ open: true, poId: res.id });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" /> Procurement
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage suppliers, raise purchase orders, and receive goods into inventory.
        </p>
      </div>

      <Tabs defaultValue="purchase_orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchase_orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="invoices">Vendor Invoices</TabsTrigger>
        </TabsList>

        {/* Purchase Orders */}
        <TabsContent value="purchase_orders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Purchase Orders</CardTitle>
              <Button onClick={onAddPO} disabled={createDraft.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add PO
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead className="text-right">Total (RM)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          No purchase orders yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((po) => (
                        <TableRow
                          key={po.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setPOSheet({ open: true, poId: po.id })}
                        >
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>{po.supplier?.name ?? '—'}</TableCell>
                          <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '—'}</TableCell>
                          <TableCell className="text-right">{Number(po.total_amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={statusBadge[po.status]}>{po.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suppliers */}
        <TabsContent value="suppliers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Suppliers
              </CardTitle>
              <Button onClick={() => setSupplierDialog({ open: true, supplier: null })}>
                <Plus className="h-4 w-4 mr-1" /> New Supplier
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliersLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                          No suppliers yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((s) => (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSupplierDialog({ open: true, supplier: s })}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.contact_person ?? '—'}</TableCell>
                          <TableCell>{s.phone ?? '—'}</TableCell>
                          <TableCell>{s.email ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
                              {s.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vendor Invoices placeholder */}
        <TabsContent value="invoices">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold">Vendor Invoices</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Match supplier invoices against received POs and track payables. Coming in Phase 2C.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SupplierDialog
        open={supplierDialog.open}
        onOpenChange={(open) => setSupplierDialog({ open, supplier: open ? supplierDialog.supplier : null })}
        supplier={supplierDialog.supplier}
      />
      <POSheet
        open={poSheet.open}
        poId={poSheet.poId}
        onOpenChange={(open) => setPOSheet({ open, poId: open ? poSheet.poId : null })}
      />
    </div>
  );
}
