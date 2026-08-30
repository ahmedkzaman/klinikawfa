import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function DeleteCatalogueEntryDialog({ open, onOpenChange, name, onConfirm, isPending }: {
  open: boolean; onOpenChange: (open: boolean) => void; name: string; onConfirm: () => void; isPending: boolean;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete “{name}”?</DialogTitle>
        <DialogDescription>
          This safely archives the entry so it cannot be used in new bills or selections. Existing patient, billing, stock, and financial records remain unchanged.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
