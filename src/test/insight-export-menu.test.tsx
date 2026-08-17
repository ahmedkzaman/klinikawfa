import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InsightExportMenu } from '@/components/clinic/insight/shared/InsightExportMenu';

describe('InsightExportMenu', () => {
  it('exposes disabled reasons to assistive technology and does not invoke disabled downloads', () => {
    const download = vi.fn();
    render(<InsightExportMenu items={[{ id: 'empty', label: 'Consultation CSV', download, disabled: true, disabledReason: 'No rows for this period.' }]} />);

    expect(screen.getByText(/Consultation CSV unavailable: No rows for this period/i)).toHaveClass('sr-only');
    expect(download).not.toHaveBeenCalled();
  });
});
