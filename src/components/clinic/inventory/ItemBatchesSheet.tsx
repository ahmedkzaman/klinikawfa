import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Boxes, History, Loader2, Pencil } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useInventoryBatches,
  useInventoryTransactions,
  useAddBatch,
  useAdjustBatch,
  batchHealth,
  type InventoryBatch,
} from '@/hooks/clinic/usePharmacyBatches';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  itemName: string | null;
}

const TX_LABEL: Record<string, string> = {
  restock: 'Restock',
  dispense: 'Dispense',
  adjustment: 'Adjustment',
  return: 'Return',
  'write-off': 'Write-off',
  expire: 'Expired',
  owe_slip_fulfilled: 'Owe slip fulfilled',
};

const TX_COLOR: Record<string, string> = {
  restock: 'bg-emerald-50 text-emerald-700',
  dispense: 'bg-blue-50 text-blue-700',
  adjustment: 'bg-amber-50 text-amber-700',
  return: 'bg-slate-100 text-slate-700',
  'write-off': 'bg-rose-50 text-rose-700',
  expire: 'bg-rose-50 text-rose-700',
  owe_slip_fulfilled: 'bg-violet-50 text-violet-700',
};

export function ItemBatchesSheet({ open, onOpenChange, itemId, itemName }: Props) {
  const [tab, setTab] = useState<'batches' | 'ledger'>('batches');
  const [addOpen, setAddOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryBatch | null>(null);

  const { data: batches = [], isLoading: bLoading } = useInventoryBatches(itemId ?? undefined);
  const { data: txs = [], isLoading: tLoading } = useInventoryTransactions(itemId ?? undefined);

  const totalUnexpired = useMemo(
    () =>
      batches
        .filter((b) => batchHealth(b) !== 'expired')
        .reduce((acc, b) => acc + b.quantity_remaining, 0),
    [batches],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-2xl w-full flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-blue-600" />
              {itemName ?? 'Item'} — Batches & Ledger
            </SheetTitle>
            <SheetDescription>
              Total unexpired stock:{' '}
              <span className="font-semibold tabular-nums text-foreground">{totalUnexpired}</span>
            </SheetDescription>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'batches' | 'ledger')} className="flex-1 mt-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="batches">
                  <Boxes className="h-3.5 w-3.5 mr-1.5" /> Batches
                </TabsTrigger>
                <TabsTrigger value="ledger">
                  <History className="h-3.5 w-3.5 mr-1.5" /> Ledger
                </TabsTrigger>
              </TabsList>
              {tab === 'batches' && (
                <Button size="sm" onClick={() => setAddOpen(true)} disabled={!itemId}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Batch
                </Button>
              )}
            </div>

            <TabsContent value="batches" className="mt-3 overflow-auto">
              {bLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  No batches yet. Click "Add Batch" to record a delivery.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Initial</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => {
                      const h = batchHealth(b);
                      return (
                        <TableRow key={b.id} className={h === 'expired' ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">{b.batch_number}</TableCell>
                          <TableCell>{b.expiry_date}</TableCell>
                          <TableCell className="text-right tabular-nums">{b.quantity_initial}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{b.quantity_remaining}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {b.cost_price != null ? `RM ${Number(b.cost_price).toFixed(2)}` : '—'}
                          </TableCell>
                          <TableCell>
                            {h === 'expired' ? (
                              <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-50 border-none">Expired</Badge>
                            ) : h === 'expiring' ? (
                              <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-none">Expiring</Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-none">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setAdjustTarget(b)}
                              aria-label="Adjust"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="ledger" className="mt-3 overflow-auto">
              {tLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : txs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">No transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {txs.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.created_at), 'd MMM HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${TX_COLOR[t.transaction_type] ?? 'bg-slate-100 text-slate-700'} border-none hover:opacity-100`}>
                            {TX_LABEL[t.transaction_type] ?? t.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold ${
                            t.qty_change > 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {t.qty_change > 0 ? '+' : ''}
                          {t.qty_change}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.reason_code ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {t.notes ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AddBatchDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        itemId={itemId}
      />
      <AdjustBatchDialog
        batch={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        itemId={itemId}
      />
    </>
  );
}

function AddBatchDialog({
  open,
  onOpenChange,
  itemId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
}) {
  const addBatch = useAddBatch();
  const [batchNumber, setBatchNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState<string>('');
  const [cost, setCost] = useState<string>('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setBatchNumber('');
    setExpiry('');
    setQty('');
    setCost('');
    setNotes('');
  };

  const submit = async () => {
    if (!itemId || !batchNumber || !expiry || !qty) return;
    await addBatch.mutateAsync({
      itemId,
      batchNumber: batchNumber.trim(),
      expiryDate: expiry,
      quantity: Number(qty),
      costPrice: cost ? Number(cost) : null,
      notes: notes.trim() || null,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new batch</DialogTitle>
          <DialogDescription>
            Records the delivery and increases on-hand stock. Each batch tracks its own expiry for FEFO consumption.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="bn">Batch number *</Label>
            <Input id="bn" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="e.g. AX-23042" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp">Expiry date *</Label>
            <Input id="exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantity *</Label>
            <Input id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cost">Unit cost (RM)</Label>
            <Input id="cost" type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Supplier, PO ref…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!batchNumber || !expiry || !qty || addBatch.isPending}
          >
            {addBatch.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Add Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustBatchDialog({
  batch,
  onClose,
  itemId,
}: {
  batch: InventoryBatch | null;
  onClose: () => void;
  itemId: string | null;
}) {
  const adjust = useAdjustBatch();
  const [delta, setDelta] = useState<string>('');
  const [reason, setReason] = useState<string>('count_correction');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!batch || !itemId || !delta) return;
    await adjust.mutateAsync({
      itemId,
      batchId: batch.id,
      delta: Number(delta),
      reason,
      notes: notes.trim() || null,
    });
    setDelta('');
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={!!batch} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust batch {batch?.batch_number}</DialogTitle>
          <DialogDescription>
            Use a positive delta to add stock back, negative to write off. The change is logged in the ledger.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="delta">Delta (e.g. -5 to write off 5)</Label>
            <Input id="delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Current remaining: <span className="font-semibold">{batch?.quantity_remaining}</span>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count_correction">Count correction</SelectItem>
                <SelectItem value="damage">Damaged</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="theft">Loss / theft</SelectItem>
                <SelectItem value="return_to_supplier">Return to supplier</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anotes">Notes</Label>
            <Input id="anotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!delta || adjust.isPending}>
            {adjust.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
