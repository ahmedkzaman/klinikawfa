import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useClinicChargeTypes,
  useUpsertChargeType,
  useToggleChargeType,
  type ClinicChargeType,
} from '@/hooks/clinic/useClinicChargeTypes';
import { cn } from '@/lib/utils';
import { bento, bentoHeader, pageInner, pageShell } from '@/lib/clinic/bentoTokens';

export default function ChargesSettings() {
  const { data: charges = [], isLoading } = useClinicChargeTypes();
  const upsert = useUpsertChargeType();
  const toggle = useToggleChargeType();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicChargeType | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('0');

  const openNew = () => {
    setEditing(null);
    setName('');
    setAmount('0');
    setOpen(true);
  };

  const openEdit = (c: ClinicChargeType) => {
    setEditing(c);
    setName(c.name);
    setAmount(String(c.default_amount));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({
      id: editing?.id,
      name: name.trim(),
      default_amount: parseFloat(amount) || 0,
    });
    setOpen(false);
  };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/clinic/settings">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Other Charges
            </h1>
            <p className="text-sm text-slate-500">
              Optional billing charges available at checkout. Inactive items are hidden from staff.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Add charge
          </Button>
        </div>

        <Card className={cn(bento, 'p-0 overflow-hidden')}>
          <div className={cn(bentoHeader, 'px-4 py-3 border-b border-slate-100')}>
            Charge dictionary
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : charges.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No charges yet. Click <span className="font-medium">Add charge</span> to create one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Default (RM)</th>
                  <th className="text-center px-4 py-2.5 font-semibold">Active</th>
                  <th className="px-4 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {Number(c.default_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={(v) =>
                          toggle.mutate({ id: c.id, is_active: v })
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(c)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit charge' : 'New charge'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="charge-name">Name</Label>
              <Input
                id="charge-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Statutory KKM Charge"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="charge-amount">Default amount (RM)</Label>
              <Input
                id="charge-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || upsert.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
