import { ClipboardList } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface VisitRemarksBannerProps {
  remarks?: string | null;
}

export function VisitRemarksBanner({ remarks }: VisitRemarksBannerProps) {
  if (!remarks || !remarks.trim()) return null;
  return (
    <Alert className="bg-slate-50 border-slate-200 text-slate-800">
      <ClipboardList className="h-4 w-4 !text-slate-600" />
      <AlertTitle className="text-slate-900">Today's Visit Remarks</AlertTitle>
      <AlertDescription className="whitespace-pre-wrap text-slate-700">
        {remarks}
      </AlertDescription>
    </Alert>
  );
}

export default VisitRemarksBanner;
