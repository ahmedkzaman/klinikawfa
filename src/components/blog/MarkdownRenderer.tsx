import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (!content) return '';

    let result = content;

    // Escape HTML to prevent XSS
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Process markdown syntax
    // Headers (### before ##)
    result = result.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>');
    result = result.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-4">$1</h2>');

    // Bold and italic
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links [text](url)
    result = result.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Unordered lists
    result = result.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
    result = result.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul class="my-4 space-y-1">${match}</ul>`);

    // Ordered lists
    result = result.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');
    
    // Line breaks (double newline = paragraph)
    const paragraphs = result.split(/\n\n+/);
    result = paragraphs
      .map((p) => {
        const trimmed = p.trim();
        // Don't wrap if already a block element
        if (
          trimmed.startsWith('<h') ||
          trimmed.startsWith('<ul') ||
          trimmed.startsWith('<ol') ||
          trimmed.startsWith('<li')
        ) {
          return trimmed;
        }
        // Handle single line breaks within paragraphs
        const withBreaks = trimmed.replace(/\n/g, '<br />');
        return withBreaks ? `<p class="mb-4 leading-relaxed">${withBreaks}</p>` : '';
      })
      .join('\n');

    return result;
  }, [content]);

  return (
    <div
      className={`prose prose-gray max-w-none dark:prose-invert ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
