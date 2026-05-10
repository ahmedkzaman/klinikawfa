import { useState } from 'react';
import { format } from 'date-fns';
import { PackageX, Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/seo/SEOHead';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useOweSlips,
  useFulfillOweSlip,
  type OweSlipRow,
} from '@/hooks/clinic/useOweSlips';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';
import { cn } from '@/lib/utils';

type Tab = 'open' | 'all';

export default function OweSlipsPage() {
  const [tab, setTab] = useState<Tab>('open');
  const statuses: OweSlipRow['status'][] =
    tab === 'open' ? ['open', 'partially_fulfilled'] : ['open', 'partially_fulfilled', 'fulfilled', 'cancelled'];
  const { data: slips = [], isLoading } = useOweSlips({ statuses });
  const [target, setTarget] = useState<OweSlipRow | null>(null);

  return (
    <>
      <SEOHead title="Owe Slips — Clinic Portal" description="Patients waiting on outstanding medication." noIndex />
      <div className={pageShell}>
        <div className={pageInner}>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Owe Slips</h1>
            <p className="text-sm text-slate-500 mt-1">
              Patients owed medication when stock ran out at dispensing.
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="open">Open / Partial</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {isLoading ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : slips.length === 0 ? (
                <Card className={cn(bento)}>
                  <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
                      <PackageX className="h-7 w-7 text-emerald-600" />
                    </div>
                    <p className="text-sm text-slate-500">No outstanding owe slips. Great news!</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className={cn(bento, 'overflow-hidden')}>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 border-b border-slate-100">
                          <TableHead>Patient</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Owed</TableHead>
                          <TableHead className="text-right">Fulfilled</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slips.map((s) => {
                          const remaining = s.qty_owed - s.qty_fulfilled;
                          const days = Math.floor(
                            (Date.now() - new Date(s.created_at).getTime()) / (24 * 60 * 60 * 1000),
                          );
                          return (
                            <TableRow key={s.id} className="border-b border-slate-100 last:border-0">
                              <TableCell className="font-medium">
                                {s.patients?.name ?? '—'}
                                <div className="text-xs text-muted-foreground">{s.patients?.phone ?? ''}</div>
                              </TableCell>
                              <TableCell>{s.inventory_items?.name ?? '—'}</TableCell>
                              <TableCell className="text-right tabular-nums">{s.qty_owed}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {s.qty_fulfilled}
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({remaining} left)
                                </span>
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={s.status} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(s.created_at), 'd MMM')}
                                <div>{days}d ago</div>
                              </TableCell>
                              <TableCell className="text-right">
                                {(s.status === 'open' || s.status === 'partially_fulfilled') && (
                                  <Button size="sm" onClick={() => setTarget(s)}>
                                    Fulfill
                                  </Button>
                                )}
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
        </div>
      </div>
      <FulfillDialog slip={target} onClose={() => setTarget(null)} />
    </>
  );
}

function StatusBadge({ status }: { status: OweSlipRow['status'] }) {
  const map: Record<OweSlipRow['status'], string> = {
    open: 'bg-amber-50 text-amber-700',
    partially_fulfilled: 'bg-blue-50 text-blue-700',
    fulfilled: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return <Badge className={`${map[status]} border-none hover:opacity-100`}>{status.replace('_', ' ')}</Badge>;
}

function FulfillDialog({ slip, onClose }: { slip: OweSlipRow | null; onClose: () => void }) {
  const fulfill = useFulfillOweSlip();
  const remaining = slip ? slip.qty_owed - slip.qty_fulfilled : 0;
  const [qty, setQty] = useState<string>('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!slip || !qty) return;
    try {
      await fulfill.mutateAsync({ slipId: slip.id, qty: Number(qty), notes: notes || null });
      setQty('');
      setNotes('');
      onClose();
    } catch {
      /* toast in hook */
    }
  };

  return (
    <Dialog
      open={!!slip}
      onOpenChange={(v) => {
        if (!v) {
          setQty('');
          setNotes('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fulfill owe slip</DialogTitle>
          <DialogDescription>
            Dispenses from the oldest unexpired batch and updates the slip. Patient: <strong>{slip?.patients?.name}</strong>, item: <strong>{slip?.inventory_items?.name}</strong>, remaining: <strong>{remaining}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantity to dispense</label>
            <Input
              type="number"
              min={1}
              max={remaining}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!qty || Number(qty) <= 0 || Number(qty) > remaining || fulfill.isPending}
          >
            {fulfill.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Fulfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
