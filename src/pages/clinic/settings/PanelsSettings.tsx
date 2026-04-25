import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
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
  useInsuranceProviders,
} from '@/hooks/clinic/useInsuranceProviders';
import { PanelDialog } from '@/components/clinic/settings/PanelDialog';

export default function PanelsSettings() {
  const { data: panels = [], isLoading } = useInsuranceProviders();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/clinic/settings">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Panels & Insurance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage corporate panels, TPAs, and insurance provider profiles.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Panel
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, PIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    {search
                      ? 'No panels match your search.'
                      : 'No panels yet. Click "Add Panel" to create one.'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.panel_code || '—'}
                    </TableCell>
                    <TableCell className="capitalize text-sm">
                      {p.panel_type}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.person_in_charge || '—'}
                    </TableCell>
                    <TableCell className="text-sm">{p.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === 'active' ? 'default' : 'secondary'}
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {p.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(p)}
                            className="text-destructive hover:text-destructive"
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
        </div>
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
  );
}
