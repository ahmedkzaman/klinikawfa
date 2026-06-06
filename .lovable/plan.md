# Rich Text Description Editor for Landing Pages

## 1. Install packages
`react-quill-new`, `dompurify`, `@types/dompurify` (already installed in prior step).

## 2. New: `src/components/admin/RichTextEditor.tsx`
- Wraps `ReactQuill` (snow theme) with controlled `value` / `onChange`.
- Toolbar: headings (1/2/3), bold, italic, underline, strike, ordered/bullet list, link, image, video, clean.
- Custom **image handler**: hidden file input → upload to `clinic-assets/landing-pages/inline/{timestamp}-{rand}-{name}` → `insertEmbed` at cursor.
- Custom **video handler**: file input (`video/*`) → upload → inserts `<p><video controls src="…"></video></p>` via `clipboard.dangerouslyPasteHTML` (Quill's default video blot is iframe-only).
- Shows a "Uploading media…" overlay while in flight; surfaces upload state via `onUploadStateChange` callback.

## 3. `src/pages/staff/admin/LandingPages.tsx`
- Import `RichTextEditor` and `DOMPurify`.
- Zod: `description: z.string().min(1).max(20000)` (was 500).
- New state `isInlineUploading` set by the editor callback.
- Replace `<Textarea>` for description with `<RichTextEditor>`.
- Live Preview hero: swap plain `<p>{description}</p>` for a sanitized `dangerouslySetInnerHTML` block with class `service-rich-content prose max-w-none`.
- Save button disabled while `isInlineUploading || isUploading || isPending`.

## 4. `src/pages/ServiceDetail.tsx`
- Import `DOMPurify`; define `purifyConfig` allowing `video`, `source`, `iframe` tags and `controls/allow/allowfullscreen/frameborder/target` attrs.
- SEO meta description: strip HTML (`replace(/<[^>]+>/g,'')`) and truncate to 160 chars.
- Replace hero `<p>{service.description}</p>` with:
  ```tsx
  <div className="service-rich-content prose max-w-none mb-8 text-muted-foreground"
       dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(service.description, purifyConfig) }} />
  ```

## 5. `src/index.css`
Append global styles for rendered rich content + Quill editor min-height tweak:
```css
.service-rich-content img,
.service-rich-content video {
  @apply max-w-full h-auto rounded-lg shadow-sm my-6 border border-border/50 mx-auto;
}
.service-rich-content ul { @apply list-disc pl-6 my-4; }
.service-rich-content ol { @apply list-decimal pl-6 my-4; }
.service-rich-content a  { @apply text-primary hover:underline; }
.service-rich-content h1,
.service-rich-content h2,
.service-rich-content h3 { @apply text-foreground font-bold mt-6 mb-3; }
.rich-text-editor-wrapper .ql-container { min-height: 200px; }
```

## Notes
- Bucket: reuse existing public `clinic-assets` (workspace blocks new public buckets); spec's `clinic-media` is mapped to this.
- Existing plain-text descriptions still render fine (treated as text nodes).
- No Tailwind Typography plugin installed; `prose` classes degrade gracefully and the custom CSS covers the essentials.
