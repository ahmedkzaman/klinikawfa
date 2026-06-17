import { Printer, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getPaperStyle, type PaperOrientation, type PaperSize } from '@/lib/clinic/paperStyle';
import type { ConsultationDocument } from '@/hooks/clinic/useClinicDocuments';

interface Props {
  doc: ConsultationDocument | null;
  onClose: () => void;
  onPrint: (doc: ConsultationDocument) => void;
}

export function ViewDocumentModal({ doc, onClose, onPrint }: Props) {
  if (!doc) return null;
  const size = (doc.paper_size as PaperSize) ?? 'A4';
  const orientation = (doc.orientation as PaperOrientation) ?? 'portrait';
  const paperStyle = getPaperStyle(size, orientation);

  return (
    <Dialog open={!!doc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            {doc.template_name}
            <Badge variant="secondary" className="text-xs">
              {size} · {orientation}
            </Badge>
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => onPrint(doc)} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto bg-slate-200 p-6 flex justify-center items-start">
          <div className="bg-white shadow-xl" style={paperStyle}>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-900 m-0">
              {doc.content}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
