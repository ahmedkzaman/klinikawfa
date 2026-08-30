import type { InventoryTxType, MovementStatus } from '@/hooks/clinic/useProcurementStats';

export const STATUS_BADGE: Record<MovementStatus, string> = {
  fast: 'bg-primary/15 text-primary',
  normal: 'bg-secondary text-secondary-foreground',
  slow: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  dead: 'bg-muted text-muted-foreground',
};

export const STATUS_LABEL: Record<MovementStatus, string> = {
  fast: 'Fast', normal: 'Normal', slow: 'Slow', dead: 'Dead',
};

export const TX_BADGE: Record<InventoryTxType, string> = {
  restock: 'bg-success/15 text-success',
  dispense: 'bg-primary/15 text-primary',
  adjustment: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  return: 'bg-success/15 text-success',
  'write-off': 'bg-destructive/15 text-destructive',
  expire: 'bg-destructive/15 text-destructive',
  owe_slip_fulfilled: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
};
