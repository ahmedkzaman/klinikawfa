import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useMyKadReader, type MyKadPayload } from '@/hooks/clinic/useMyKadReader';

/** Strip every non-digit character — handles "880101-14-5555" → "880101145555". */
export function cleanIC(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** Map JPN-style gender values to our schema's `'male' | 'female'`. */
export function mapGender(raw: string | undefined | null): 'male' | 'female' | undefined {
  const n = (raw ?? '').toLowerCase().trim();
  if (['lelaki', 'l', 'male', 'm'].includes(n)) return 'male';
  if (['perempuan', 'p', 'female', 'f'].includes(n)) return 'female';
  return undefined;
}

/** Normalize MyKad DOB to ISO `yyyy-mm-dd`. Accepts ISO, dd/mm/yyyy, ddmmyyyy. */
export function mapDOB(raw: string | undefined | null): string | undefined {
  const v = (raw ?? '').trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const slash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;
  const compact = v.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) return `${compact[3]}-${compact[2]}-${compact[1]}`;
  // YYMMDD (MyKad first 6 digits) — assume 1900s if year > current 2-digit year
  const yymmdd = v.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (yymmdd) {
    const yy = parseInt(yymmdd[1], 10);
    const currentYY = new Date().getFullYear() % 100;
    const century = yy > currentYY ? '19' : '20';
    return `${century}${yymmdd[1]}-${yymmdd[2]}-${yymmdd[3]}`;
  }
  return undefined;
}

interface ReadMyKadButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  onRead: (data: MyKadPayload) => void;
}

export function ReadMyKadButton({
  onRead,
  variant = 'outline',
  size = 'sm',
  type = 'button',
  ...rest
}: ReadMyKadButtonProps) {
  const { readMyKad, isReading } = useMyKadReader();

  const handleClick = async () => {
    const data = await readMyKad();
    if (data) onRead(data);
  };

  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isReading || rest.disabled}
      {...rest}
    >
      {isReading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading…
        </>
      ) : (
        <>💳 Read MyKad</>
      )}
    </Button>
  );
}
