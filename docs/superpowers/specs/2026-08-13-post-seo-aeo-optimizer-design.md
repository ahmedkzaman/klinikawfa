# Post SEO and AEO Optimizer Design

## Objective

Allow staff to optimize every existing and future blog post from `/editor/posts/new` and `/editor/posts/:id`. Optimization improves search metadata and answer-engine content without rewriting the clinical article itself or publishing changes automatically.

## Editor experience

Each blog-post editor shows an **SEO & AEO Optimizer** panel for both Malay and English content. Staff can start optimization after entering a slug and content in at least one language.

The optimizer reads the current slug, title, excerpt, and article body. It generates, per language with sufficient source content:

- focus phrase;
- SEO title and meta description;
- social title and social description;
- concise answer summary; and
- relevant frequently asked questions and answers.

Generated values first appear in a review dialog. The review separates Malay and English suggestions and identifies any language skipped because its source content is empty. Staff can apply all generated suggestions or cancel. Applying updates only the local editor draft and marks it dirty; the article title, excerpt, and body remain unchanged. Existing save, preview, schedule, and publish controls remain authoritative.

The canonical URL is derived from the current slug as `https://klinikawfa.com/health-tips/{slug}`. It is read-only in this workflow and is never supplied by the generation service.

## Data model

The blog-post draft schema gains these fields:

- `focusPhraseMs` and `focusPhraseEn`, each a trimmed string of at most 160 characters;
- `aeoMs` and `aeoEn`, each containing `answerSummary` and up to 12 FAQ objects;
- existing `seoMs` and `seoEn` continue storing SEO and social metadata.

The AEO fields use the same bounded answer-summary and FAQ structure already used by service-page AEO. Defaults are empty, allowing legacy posts to load without migration failures. Draft persistence, revision history, publishing, and legacy-row hydration must preserve these fields.

Published blog metadata stores the new values inside the existing website editor metadata JSON. No new public table or public write policy is required.

## Generation boundary

A dedicated authenticated Edge Function generates post SEO/AEO suggestions. Its request contains the post path and the current bilingual source text. Its response is validated against a strict schema before any editor state changes.

Generation must:

- use only provided article information and established Klinik Awfa context;
- avoid inventing diagnoses, outcomes, prices, credentials, or medical claims;
- return no canonical URL and no rewritten article body;
- produce only languages with meaningful source content; and
- return structured errors for invalid input, authentication failure, rate limiting, or malformed model output.

The function does not save or publish. This keeps AI generation separate from editorial state and prevents a model response from bypassing revision control.

## Public rendering

The published blog page selects AEO data using the active site language. When an answer summary exists, it renders near the beginning of the article as a concise answer block. When FAQs exist, it renders an accessible FAQ section after the article content.

The page emits:

- the existing Article structured data;
- FAQPage structured data only when at least one complete FAQ exists; and
- the optimized SEO/social metadata already consumed by `SEOHead`.

Empty AEO fields produce no empty UI and no empty schema. User-facing strings are bilingual.

## Existing and future posts

Legacy posts receive empty defaults when loaded and can be optimized individually. New posts use the same schema and optimizer. The feature does not bulk-change historical posts and does not alter published output until a staff member reviews, applies, saves, and publishes the draft.

## Failure and safety behavior

- Generation failure leaves all editor fields unchanged and displays a retryable error.
- A malformed response is rejected before it reaches editor state.
- Applying suggestions never changes article content.
- Unsaved-navigation recovery includes the new fields through the existing draft-recovery mechanism.
- Revision conflicts follow the existing resource editor behavior.
- Canonical URL remains locked to the Klinik Awfa post route.

## Verification

Automated coverage will verify:

- legacy and new post defaults validate;
- generation requests use current bilingual source content;
- malformed generation output is rejected;
- review cancellation makes no changes;
- applying suggestions changes only SEO/AEO fields and preserves article content;
- canonical URLs use the current post slug and Klinik Awfa origin;
- published pages render language-appropriate answer summaries and FAQs;
- FAQ structured data is present only for complete FAQ entries; and
- existing post editor, persistence, lifecycle, and public blog tests remain green.

## Out of scope

- automatic article rewriting;
- automatic saving or publishing;
- bulk optimization of all historical posts;
- keyword-ranking guarantees or third-party keyword-volume research; and
- medical-claim approval without staff review.
