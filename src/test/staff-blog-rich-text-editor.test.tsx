import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  generated: {
    title_ms: 'Tajuk AI',
    title_en: 'AI title',
    content_ms: '<p>Kandungan AI</p>',
    content_en: '<p>AI content</p>',
    excerpt_ms: 'Ringkasan AI',
    excerpt_en: 'AI excerpt',
    suggested_reading_time: 4,
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ id: 'new' }),
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ms' }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: state.toast }),
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button role="tab" type="button">{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled, id, onCheckedChange }: {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      checked={checked}
      disabled={disabled}
      id={id}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      type="checkbox"
    />
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'blog_categories') {
        const query = {
          select: vi.fn(),
          order: vi.fn(async () => ({ data: [], error: null })),
        };
        query.select.mockReturnValue(query);
        return query;
      }
      if (table === 'blog_posts') return { insert: state.insert };
      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/components/admin/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange, onUploadStateChange, placeholder }: {
    value: string;
    onChange: (value: string) => void;
    onUploadStateChange?: (uploading: boolean) => void;
    placeholder?: string;
  }) => (
    <div>
      <textarea
        data-rich-text="true"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => onUploadStateChange?.(true)}>
        Start inline upload
      </button>
    </div>
  ),
}));

vi.mock('@/components/blog', () => ({
  AIWritingAssistant: ({ onContentGenerated }: {
    onContentGenerated: (content: typeof state.generated) => void;
  }) => (
    <button type="button" onClick={() => onContentGenerated(state.generated)}>
      Generate test article
    </button>
  ),
}));

import BlogEditor from '@/pages/admin/BlogEditor';

describe('staff blog rich-text editor', () => {
  beforeAll(() => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    state.insert.mockResolvedValue({ error: null });
  });

  it('saves bilingual rich text and mirrors Malay content to the legacy field', async () => {
    render(<BlogEditor />);

    const malayEditor = await screen.findByPlaceholderText('Tulis kandungan dalam Bahasa Melayu...');
    expect(malayEditor).toHaveAttribute('data-rich-text', 'true');

    fireEvent.change(screen.getByLabelText('Tajuk (BM) *'), { target: { value: 'Artikel Klinik' } });
    fireEvent.change(malayEditor, { target: { value: '<p><strong>Tebal</strong></p>' } });
    const englishEditor = screen.getByPlaceholderText('Write content in English...');
    expect(englishEditor).toHaveAttribute('data-rich-text', 'true');
    fireEvent.change(englishEditor, { target: { value: '<p><em>Italic</em></p>' } });

    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));

    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      content: '<p><strong>Tebal</strong></p>',
      content_ms: '<p><strong>Tebal</strong></p>',
      content_en: '<p><em>Italic</em></p>',
    }));
  });

  it('shows AI content in both controlled rich-text editors', async () => {
    render(<BlogEditor />);
    await screen.findByPlaceholderText('Tulis kandungan dalam Bahasa Melayu...');

    fireEvent.click(screen.getByRole('button', { name: 'Generate test article' }));
    expect(screen.getByPlaceholderText('Tulis kandungan dalam Bahasa Melayu...')).toHaveValue('<p>Kandungan AI</p>');
    expect(screen.getByPlaceholderText('Write content in English...')).toHaveValue('<p>AI content</p>');
  });

  it('blocks saving while an inline media upload is active', async () => {
    render(<BlogEditor />);
    await screen.findByPlaceholderText('Tulis kandungan dalam Bahasa Melayu...');

    fireEvent.click(screen.getAllByRole('button', { name: 'Start inline upload' })[0]);
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled();
  });
});
