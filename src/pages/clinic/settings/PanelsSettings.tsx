import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { bento, pageInner, pageShell, primaryBtn, softInput } from '@/lib/clinic/bentoTokens';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  type InsuranceProviderRow,
  useDeleteInsuranceProvider,
  useFinanceInsuranceProviders,
} from '@/hooks/clinic/useInsuranceProviders';
import { PanelDialog } from '@/components/clinic/settings/PanelDialog';

export default function PanelsSettings() {
  const { data: panels = [], isLoading } = useFinanceInsuranceProviders();
  const deleteMut = useDeleteInsuranceProvider();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InsuranceProviderRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InsuranceProviderRow | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return panels;
    return panels.filter((p) =>
      [p.name, p.panel_code, p.person_in_charge, p.panel_type]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [panels, search]);

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (panel: InsuranceProviderRow) => {
    setEditing(panel);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync(confirmDelete.id);
      toast.success(`${confirmDelete.name} marked as inactive`);
      setConfirmDelete(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      toast.error(message);
    }
  };

  const TH = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wider';
  const TR = 'border-slate-100';

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="text-slate-600 hover:text-slate-900 hover:bg-slate-100">
            <Link to="/clinic/settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 text-blue-600 p-3 shrink-0">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Panels &amp; Insurance
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage corporate panels, TPAs, and insurance provider profiles.
              </p>
            </div>
          </div>
          <Button onClick={openAdd} className={primaryBtn}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Panel
          </Button>
        </div>

        <Card className={bento}>
          <CardContent className="p-6">
            <div className="relative max-w-sm mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, code, PIC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(softInput, 'pl-9')}
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow className={cn(TR, 'hover:bg-transparent bg-slate-50/50')}>
                  <TableHead className={TH}>Name</TableHead>
                  <TableHead className={TH}>Code</TableHead>
                  <TableHead className={TH}>Type</TableHead>
                  <TableHead className={TH}>PIC</TableHead>
                  <TableHead className={TH}>Phone</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className={TR}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow className={TR}>
                    <TableCell colSpan={7} className="text-center text-sm text-slate-400 py-8">
                      {search
                        ? 'No panels match your search.'
                        : 'No panels yet. Click "Add Panel" to create one.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id} className={TR}>
                      <TableCell className="font-medium text-slate-800">{p.name}</TableCell>
                      <TableCell className="text-slate-500">{p.panel_code || '—'}</TableCell>
                      <TableCell className="capitalize text-sm text-slate-600">{p.panel_type}</TableCell>
                      <TableCell className="text-sm text-slate-600">{p.person_in_charge || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-600">{p.phone || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            'border-none rounded-full',
                            p.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-100',
                          )}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="text-slate-600 hover:text-slate-900 hover:bg-slate-100">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {p.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(p)}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      <PanelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        panel={editing}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate panel?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDelete?.name}</strong> will be marked inactive and
              hidden from check-in and payment dropdowns. Existing claims and
              visit records will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
