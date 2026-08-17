import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type InsightStateProps =
  | { state: 'loading'; label?: string; error?: never; onRetry?: never; retryLabel?: never }
  | { state: 'error'; label?: string; error?: unknown; onRetry?: () => void; retryLabel?: string }
  | { state: 'empty'; label?: string; error?: never; onRetry?: never; retryLabel?: never }
  | { state: 'partial'; label?: string; error?: never; onRetry?: () => void; retryLabel?: string }
  | { state: 'success'; label?: string; error?: never; onRetry?: never; retryLabel?: never };

export function InsightState({ state, label, error, onRetry, retryLabel }: InsightStateProps) {
  const message = state === 'error'
    ? `${label ?? 'Insights'} could not be loaded${error instanceof Error ? `: ${error.message}` : '.'}`
    : label ?? (state === 'loading' ? 'Loading insights…' : state === 'success' ? 'Insights are up to date.' : state === 'partial' ? 'Some insight data is delayed.' : 'No insight data is available for this period.');

  const Icon = state === 'loading' ? LoaderCircle : state === 'error' ? AlertCircle : Inbox;
  const tone = state === 'error' ? 'text-rose-600' : 'text-slate-500';
  const effectiveRetryLabel = retryLabel ?? `Retry ${label ?? 'insights'}`;

  return (
    <Card>
      <CardContent className={`flex min-h-32 flex-col items-center justify-center gap-3 p-6 text-sm ${tone}`} role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'}>
        <div className="flex items-center justify-center gap-2">
          <Icon className={state === 'loading' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
          <span>{message}</span>
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} aria-label={effectiveRetryLabel}>
            {effectiveRetryLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
