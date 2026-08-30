import { memo, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: number | null;
  tone?: 'destructive' | 'amber';
}

export const KpiCard = memo(function KpiCard({ icon, label, value, tone }: KpiCardProps) {
  const valueClass = tone === 'destructive' ? 'text-destructive' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : '';
  return (
    <Card aria-label={value == null ? `${label}: loading` : `${label}: ${value.toLocaleString()}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span aria-hidden="true">{icon}</span>
      </CardHeader>
      <CardContent>
        {value == null
          ? <Skeleton className="h-9 w-16" aria-hidden="true" />
          : <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${valueClass}`}>{value.toLocaleString()}</div>}
      </CardContent>
    </Card>
  );
});
