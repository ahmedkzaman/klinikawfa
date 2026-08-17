import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InsightState } from '@/components/clinic/insight/shared/InsightState';

describe('InsightState', () => {
  it('uses an alert only for errors and status for partial and success states', () => {
    const { rerender } = render(<InsightState state="partial" label="Some metrics are delayed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Some metrics are delayed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<InsightState state="success" label="Performance is up to date" />);
    expect(screen.getByRole('status')).toHaveTextContent('Performance is up to date');

    rerender(<InsightState state="error" error={new Error('Unavailable')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  });
});
