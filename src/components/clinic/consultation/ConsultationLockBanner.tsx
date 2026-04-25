import { AlertTriangle, Unlock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface Props {
  onForceUnlock: () => void;
}

export function ConsultationLockBanner({ onForceUnlock }: Props) {
  return (
    <Alert
      variant="destructive"
      className="border-destructive/40 bg-destructive/5"
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="font-semibold">⚠️ FILE IN USE</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-1">
        <span className="text-sm">
          This consultation is currently opened by another staff member. Please
          coordinate with them before making changes to the treatment cart.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onForceUnlock}
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Unlock className="h-3.5 w-3.5 mr-1.5" />
          Force Unlock
        </Button>
      </AlertDescription>
    </Alert>
  );
}
