import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

import BlogSearch from '@/components/blog/BlogSearch';

describe('BlogSearch pagination regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not rerun an unchanged search when its parent rerenders', () => {
    const initialOnChange = vi.fn();
    const rerenderedOnChange = vi.fn();
    const view = render(<BlogSearch value="" onChange={initialOnChange} />);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(initialOnChange).toHaveBeenCalledOnce();

    view.rerender(<BlogSearch value="" onChange={rerenderedOnChange} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(rerenderedOnChange).not.toHaveBeenCalled();
  });
});
