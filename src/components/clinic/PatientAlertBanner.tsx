import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PatientAlertBannerProps {
  patientName: string;
  remarks?: string | null;
}

/**
 * Patient-level panel balance/remarks note (e.g. "Limit left: RM 21").
 * Persists on the `patients` row and is shown to doctor + dispensary
 * regardless of today's `entry.panel_id` — a previously-panel patient now
 * paying cash still needs the doctor to see the context.
 */
export function PatientAlertBanner({ patientName, remarks }: PatientAlertBannerProps) {
  const text = (remarks ?? '').trim();
  if (!text) return null;

  return (
    <Alert className="border-blue-500 bg-blue-50 text-blue-900 [&>svg]:text-blue-700">
      <Info className="h-4 w-4" />
      <AlertTitle className="font-semibold">
        Patient Panel Note: {patientName}
      </AlertTitle>
      <AlertDescription className="whitespace-pre-wrap text-blue-900/90">
        {text}
      </AlertDescription>
    </Alert>
  );
}
