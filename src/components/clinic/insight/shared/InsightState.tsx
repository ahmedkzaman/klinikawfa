import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from 'lucide-react';

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

  const Icon = state === 'loading' ? LoaderCircle : state === 'error' ? AlertCircle : state === 'success' ? CheckCircle2 : Inbox;
  const tone = state === 'error' ? 'text-rose-600' : state === 'success' ? 'text-emerald-700' : state === 'partial' ? 'text-amber-700' : 'text-slate-500';
  const effectiveRetryLabel = retryLabel ?? `Retry ${label ?? 'insights'}`;

  // Ambient one-line statuses (partial/success) render as a slim inline banner;
  // blocking states (loading/error/empty) keep the centered layout they replace content with.
  if (state === 'partial' || state === 'success') {
    return (
      <Card>
        <CardContent className={`flex flex-wrap items-center gap-2 p-3 text-sm ${tone}`} role="status" aria-live="polite">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onRetry} aria-label={effectiveRetryLabel}>
              {effectiveRetryLabel}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

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
