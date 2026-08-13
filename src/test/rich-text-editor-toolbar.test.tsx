import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: vi.fn() } },
}));

import { RichTextEditor } from '@/components/admin/RichTextEditor';

describe('shared rich-text editor toolbar', () => {
  it('offers bold, italic, and underline formatting controls', () => {
    const { container } = render(
      <RichTextEditor onChange={vi.fn()} value="<p>Article</p>" />,
    );

    expect(container.querySelector('.ql-bold')).toBeInTheDocument();
    expect(container.querySelector('.ql-italic')).toBeInTheDocument();
    expect(container.querySelector('.ql-underline')).toBeInTheDocument();
  });
});
