import React from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertCircle } from 'lucide-react';

interface CallTimerProps {
  formattedTime: string;
  totalMinutes: number;
  freeMinutes: number;
  currentCost: number;
  additionalCost: number;
  isOverFreeTime: boolean;
  className?: string;
}

export function CallTimer({
  formattedTime,
  totalMinutes,
  freeMinutes,
  currentCost,
  additionalCost,
  isOverFreeTime,
  className,
}: CallTimerProps) {
  const formatCurrency = (cents: number) => {
    return `RM ${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <span className="text-2xl font-mono font-bold">{formattedTime}</span>
      </div>
      
      <div className="text-sm text-muted-foreground">
        {totalMinutes} / {freeMinutes} free minutes used
      </div>

      {isOverFreeTime && (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">
            Extra charges: {formatCurrency(additionalCost)}
          </span>
        </div>
      )}

      <div className="text-lg font-semibold">
        Total: {formatCurrency(currentCost)}
      </div>
    </div>
  );
}
