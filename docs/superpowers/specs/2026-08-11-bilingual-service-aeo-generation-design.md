# Bilingual Service AEO Generation Design

## Goal

Add an explicit editor action that generates Malay and English Answer Engine Optimization content for a service page without changing its SEO metadata.

## User Experience

- Add a `Generate AEO (Malay & English)` button to the Answer Engine Content panel in `/editor/services/seo/:id`.
- The button remains visible regardless of the selected editor language.
- While generation is running, disable conflicting save, publish, and generation actions and show `Generating AEO…`.
- On success, update both language variants and save them privately as a draft.
- Keep the current language tab selected so the editor can immediately review the generated content.
- Show a success message stating that bilingual AEO was saved as a draft and must be reviewed before publishing.
- Show a clear error without modifying the current editor state when generation fails.

## Generation Contract

- Generate `aeoMs` and `aeoEn` in one authenticated Edge Function request.
- Preserve `seoMs`, `seoEn`, both focus phrases, canonical settings, social metadata, robots settings, and media fields exactly as they were before the request.
- Supply the existing Malay and English service content, titles, path, and focus phrases as source context.
- Reuse the existing AEO schemas: each language has a direct answer summary and up to 12 question-and-answer entries.
- Generated medical content must not invent diagnoses, guaranteed outcomes, prices, availability, or unsupported clinic claims.

## API Boundary

Add an AEO-only draft-generation API alongside the existing combined SEO/AEO generator. It will invoke `generate-service-seo` with an explicit AEO-only mode, parse only the bilingual AEO result, merge those two fields into the current payload, validate the complete payload, and save through the existing private draft API using optimistic revision control.

The existing `Generate SEO with AI` behaviour remains unchanged.

## Data and Security

- No database schema or RLS change is required.
- No content is published automatically.
- The Edge Function remains JWT-protected.
- Existing editor permissions and draft/publish controls continue to apply.

## Testing

- Editor test: dedicated bilingual AEO button is visible and has a loading state.
- Editor test: successful generation updates the draft and shows the review notice.
- API test: AEO-only generation preserves every SEO and focus-phrase field while replacing only `aeoMs` and `aeoEn`.
- Edge Function test: AEO-only mode returns the strict bilingual AEO shape and retains medical-claim safeguards.
- Regression verification: existing combined SEO/AEO generation, save, publish, TypeScript, and production build remain green.

