import { useState } from 'react';
import { format } from 'date-fns';
import { Plus, Pencil, Briefcase } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useCorporateClients, type CorporateClient } from '@/hooks/clinic/useCorporateClients';
import { useClientInvoices, type ClientInvoiceStatus } from '@/hooks/clinic/useClientInvoices';
import { CorporateClientDialog } from '@/components/clinic/receivables/CorporateClientDialog';
import { ClientInvoiceSheet } from '@/components/clinic/receivables/ClientInvoiceSheet';
import { pageInner, pageShell } from '@/lib/clinic/bentoTokens';

const statusBadge = (s: ClientInvoiceStatus) => {
  const map: Record<ClientInvoiceStatus, string> = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200',
    Issued: 'bg-blue-100 text-blue-700 border-blue-200',
    Paid: 'bg-green-100 text-green-700 border-green-200',
    Cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  };
  return map[s];
};

export default function Receivables() {
  const { data: clients = [], isLoading: cLoading } = useCorporateClients();
  const { data: invoices = [], isLoading: iLoading } = useClientInvoices();

  const [clientDlgOpen, setClientDlgOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<CorporateClient | null>(null);

  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const openCreateInvoice = () => {
    setEditingInvoiceId(null);
    setInvoiceSheetOpen(true);
  };
  const openInvoice = (id: string) => {
    setEditingInvoiceId(id);
    setInvoiceSheetOpen(true);
  };
  const openCreateClient = () => {
    setEditingClient(null);
    setClientDlgOpen(true);
  };
  const openEditClient = (c: CorporateClient) => {
    setEditingClient(c);
    setClientDlgOpen(true);
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Receivables</h1>
            <p className="text-sm text-slate-500">
              B2B invoicing for corporate clients — panels, training, room rentals, and other services.
            </p>
          </div>
        </div>

        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Client Invoices</h2>
                  <p className="text-xs text-slate-500">All issued and draft invoices.</p>
                </div>
                <Button onClick={openCreateInvoice}>
                  <Plus className="h-4 w-4 mr-1" /> Create Invoice
                </Button>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Total (RM)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">Loading…</TableCell></TableRow>
                    ) : invoices.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        No invoices yet. Click "Create Invoice" to start.
                      </TableCell></TableRow>
                    ) : invoices.map((inv) => (
                      <TableRow key={inv.id}
                        className="cursor-pointer"
                        onClick={() => openInvoice(inv.id)}>
                        <TableCell className="font-mono text-xs">{inv.invoice_no}</TableCell>
                        <TableCell>{inv.client?.name ?? '—'}</TableCell>
                        <TableCell>{inv.issue_date ? format(new Date(inv.issue_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell>{inv.due_date ? format(new Date(inv.due_date), 'dd MMM yyyy') : '—'}</TableCell>
                        <TableCell className="text-right font-mono">{Number(inv.total_amount).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadge(inv.status)}>{inv.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="clients">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Corporate Clients</h2>
                  <p className="text-xs text-slate-500">Companies and organisations you bill.</p>
                </div>
                <Button onClick={openCreateClient}>
                  <Plus className="h-4 w-4 mr-1" /> Add Client
                </Button>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">Loading…</TableCell></TableRow>
                    ) : clients.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">
                        No clients yet.
                      </TableCell></TableRow>
                    ) : clients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.contact_person ?? '—'}</TableCell>
                        <TableCell>{c.phone ?? '—'}</TableCell>
                        <TableCell>{c.email ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline"
                            className={c.status === 'active'
                              ? 'bg-green-100 text-green-700 border-green-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => openEditClient(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CorporateClientDialog
        open={clientDlgOpen}
        onOpenChange={setClientDlgOpen}
        client={editingClient}
      />
      <ClientInvoiceSheet
        open={invoiceSheetOpen}
        onOpenChange={setInvoiceSheetOpen}
        invoiceId={editingInvoiceId}
      />
    </div>
  );
}
