# Staff Blog Rich-Text Editor Design

## Objective

Give staff editing posts at `/staff/website/blog/:id` and `/staff/website/blog/new` the same visual formatting controls available in Website Editor, without changing the existing blog save, autosave, scheduling, publishing, or AI-writing workflows.

## Editor experience

Replace the Malay and English article-body textareas with the shared `RichTextEditor` component already used by Website Editor. Each language tab keeps its existing title and excerpt inputs and receives an independent rich-text body editor.

The toolbar supports:

- headings, font family, and font size;
- bold, italic, underline, and strike-through;
- text and background colour;
- alignment, ordered and unordered lists, and indentation;
- blockquotes and links;
- inline images and videos; and
- clearing formatting.

The obsolete Markdown-formatting hint is removed because staff will format content visually.

## Data flow and compatibility

The editors remain controlled by `formData.content_ms` and `formData.content_en`. Malay changes also update the legacy `formData.content` field, preserving the current compatibility behavior.

The shared editor emits HTML. Existing HTML loads directly. Existing plain text remains visible and editable when loaded; the first rich-text edit may normalize it into valid editor HTML. No database schema change or bulk conversion is required.

AI-generated Malay and English content continues entering through the existing `handleAIContentGenerated` callback. Because it updates the same controlled fields, generated content immediately appears in the rich-text editors and remains editable.

## Upload and submission behavior

Inline media uses the existing shared rich-text upload workflow and current clinic asset storage. The blog form tracks rich-text upload state and prevents submission while an inline upload is active, avoiding saves with incomplete media insertion.

All existing validation, autosave, draft recovery, category selection, featured-image upload, scheduling, and publishing behavior remains unchanged.

## Error handling

- Inline upload failures use the existing rich-text editor error toast and leave the document editable.
- A failed blog save retains the current editor state and uses the existing blog save error handling.
- Switching language tabs does not merge or overwrite the other language’s content.
- Empty rich-text output follows the blog editor’s existing required-content validation.

## Verification

Automated tests will verify:

- both Malay and English body fields render the shared rich-text editor;
- toolbar formatting includes bold, italic, and underline;
- editing Malay updates both `content_ms` and the legacy `content` field;
- editing English updates only `content_en`;
- AI-generated bilingual content appears in the corresponding editors;
- existing content is passed into the editor unchanged on load;
- submission is disabled during inline media upload; and
- existing blog editor save and validation tests remain green.

## Out of scope

- changing title or excerpt inputs to rich text;
- altering the public article renderer;
- migrating or rewriting historical article bodies;
- changing AI generation prompts or output; and
- redesigning the staff blog page beyond the body editor replacement.
