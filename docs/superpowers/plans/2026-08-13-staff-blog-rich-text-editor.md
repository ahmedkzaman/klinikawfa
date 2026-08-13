# Staff Blog Rich-Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bilingual staff blog body textareas with the shared visual rich-text editor while preserving existing save, AI generation, and legacy Malay content behavior.

**Architecture:** Reuse `RichTextEditor` directly inside `BlogEditor` as two controlled inputs. Keep blog persistence unchanged by adapting editor output into the existing `formData` fields, and add a component regression test that exercises the real `BlogEditor` with external Supabase and navigation boundaries mocked.

**Tech Stack:** React 18, TypeScript, React Quill, Vitest, Testing Library, Supabase client.

## Global Constraints

- Do not change the blog database schema or public article renderer.
- Preserve existing HTML and plain-text values when loading a post.
- Malay edits must update both `content_ms` and legacy `content`; English edits update only `content_en`.
- AI-generated bilingual content must remain editable through the same controlled fields.
- Prevent form submission while inline media upload is active.
- Do not alter title, excerpt, autosave, draft recovery, category, featured-image, scheduling, or publishing behavior.

---

### Task 1: Replace bilingual body textareas with shared rich-text editors

**Files:**
- Create: `src/test/staff-blog-rich-text-editor.test.tsx`
- Modify: `src/pages/admin/BlogEditor.tsx:1-25`
- Modify: `src/pages/admin/BlogEditor.tsx:45-80`
- Modify: `src/pages/admin/BlogEditor.tsx:330-420`
- Modify: `src/pages/admin/BlogEditor.tsx:515-575`
- Modify: `src/pages/admin/BlogEditor.tsx` submit button near the end of the form

**Interfaces:**
- Consumes: `RichTextEditor({ value, onChange, onUploadStateChange, placeholder })` from `@/components/admin/RichTextEditor`.
- Produces: two controlled rich-text editors backed by `formData.content_ms` and `formData.content_en`, plus `uploadingInlineMedia: boolean` used by submission guards.

- [ ] **Step 1: Write the failing component test**

Create `src/test/staff-blog-rich-text-editor.test.tsx`. Mock router/auth/language, the Supabase network boundary, and `RichTextEditor` only as a transparent controlled input that exposes its props. Render `/staff/website/blog/new` and assert:

```tsx
expect(screen.getByLabelText('Kandungan (BM) *')).toHaveAttribute('data-rich-text', 'true');
expect(screen.getByLabelText('Content (EN) *')).toHaveAttribute('data-rich-text', 'true');

fireEvent.change(screen.getByLabelText('Kandungan (BM) *'), {
  target: { value: '<p><strong>Tebal</strong></p>' },
});
fireEvent.change(screen.getByLabelText('Content (EN) *'), {
  target: { value: '<p><em>Italic</em></p>' },
});

fireEvent.click(screen.getByRole('button', { name: /save|simpan/i }));
await waitFor(() => expect(insert).toHaveBeenCalled());
expect(insert).toHaveBeenCalledWith(expect.objectContaining({
  content: '<p><strong>Tebal</strong></p>',
  content_ms: '<p><strong>Tebal</strong></p>',
  content_en: '<p><em>Italic</em></p>',
}));
```

Have the transparent test editor call `onUploadStateChange(true)`, then assert the submit button is disabled. Supply generated content through the mocked `AIWritingAssistant` callback and assert both controlled editor values update. The mock must preserve the complete `RichTextEditor` prop contract used by this page.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/test/staff-blog-rich-text-editor.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1
```

Expected: FAIL because `BlogEditor` still renders plain textareas and does not track inline rich-text upload state.

- [ ] **Step 3: Implement the minimal editor replacement**

In `BlogEditor.tsx`, import the shared editor:

```tsx
import { RichTextEditor } from '@/components/admin/RichTextEditor';
```

Add state:

```tsx
const [uploadingInlineMedia, setUploadingInlineMedia] = useState(false);
```

Replace the Malay textarea and Markdown hint with a labelled shared editor:

```tsx
<div className="space-y-2">
  <Label id="content-ms-label">Kandungan (BM) *</Label>
  <div aria-labelledby="content-ms-label">
    <RichTextEditor
      onChange={(value) => setFormData((previous) => ({
        ...previous,
        content: value,
        content_ms: value,
      }))}
      onUploadStateChange={setUploadingInlineMedia}
      placeholder="Tulis kandungan dalam Bahasa Melayu..."
      value={formData.content_ms}
    />
  </div>
</div>
```

Replace the English textarea analogously, updating only `content_en`. Give each editor an accessible label using its wrapping `aria-labelledby` relationship.

At the start of `handleSubmit`, return with a localized destructive toast when `uploadingInlineMedia` is true. Add `uploadingInlineMedia` to the existing submit button’s disabled condition so a media upload cannot race a save.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run src/test/staff-blog-rich-text-editor.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1
```

Expected: PASS with all assertions covering controlled values, legacy Malay mirroring, AI content, and upload-state blocking.

- [ ] **Step 5: Verify the real toolbar contract**

Extend the existing `RichTextEditor` test or add a narrow test in the new file without mocking the component. Assert the Quill toolbar contains buttons with classes `.ql-bold`, `.ql-italic`, and `.ql-underline`. This protects the specific formatting requested without coupling the blog test to Quill internals beyond its public toolbar controls.

Run:

```powershell
npx vitest run src/test/staff-blog-rich-text-editor.test.tsx src/test/editor-posts.test.tsx --pool=forks --fileParallelism=false --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 6: Run static and production verification**

Run:

```powershell
npx eslint src/pages/admin/BlogEditor.tsx src/test/staff-blog-rich-text-editor.test.tsx
npm run build
git diff --check
```

Expected: all commands exit 0. Existing unrelated build warnings are acceptable; new errors are not.

- [ ] **Step 7: Commit the implementation**

```powershell
git add src/pages/admin/BlogEditor.tsx src/test/staff-blog-rich-text-editor.test.tsx
git commit -m "Add rich text formatting to staff blog editor"
```

- [ ] **Step 8: Browser smoke test after deployment**

Open a staff blog draft and verify in both language tabs:

1. Existing content appears.
2. Bold, italic, and underline change selected text.
3. Save and reload preserve the generated HTML formatting.
4. AI-generated content appears in both rich-text editors.
5. No Markdown-only hint remains.

Record the tested post ID and avoid publishing the smoke-test draft unless it was already published.
