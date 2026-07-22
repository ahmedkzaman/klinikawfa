# Website Editor Recovery and Completion Plan

**Goal:** Make every visible `/editor/*` route functional against Supabase project `nhjbqdiyptjqherdfbqk`, while keeping `website_editor` isolated from clinic, patient, finance, workforce, and administrator systems.

## Confirmed diagnosis

- `/editor/services`, `/editor/team`, `/editor/blog`, `/editor/gallery`, `/editor/reviews`, and `/editor/navigation` are explicitly routed to `EditorUnavailableState` in `src/App.tsx`. They are placeholders, not runtime failures.
- `/editor/home` is implemented, but the target database has zero rows in `website_pages` and zero rows in `website_page_drafts`. The planned exact Home seed migration was never created or applied, so `fetchEditorPage("home")` cannot return a page.
- `/editor/pages` and `/editor/pages/:id` are implemented. The list is empty because there are zero CMS page rows; page creation depends on `create_general_website_page`.
- The signed-in owner account exists with `special_admin`, which is an approved website-management role. The route guard and role assignment are not the cause.
- The CMS foundation exists: eight `website_*` tables, RLS policies, the `website-media` bucket boundary, and `create_general_website_page` are present. The missing parts are seed data and resource editor implementations.

## Phase 1 — Restore Home and Pages first

1. Create an exact, deterministic Home seed from `DEFAULT_HOME_CONTENT`.
2. Add a migration test proving the SQL JSON equals the bundled Home content after canonical parsing.
3. Add an idempotent migration that inserts only the absent `home` row as published revision 1; abort instead of overwriting if a conflicting Home row appears.
4. Apply the migration to `nhjbqdiyptjqherdfbqk` only after a read-only preflight confirms the CMS tables are still empty.
5. Create the authenticated Home draft through the normal editor flow so `updated_by` is the real user, not a fabricated migration identity.
6. Verify `/editor/home`: load, edit locally, Save Draft, bottom Live Preview, unsaved-change warning, Publish, and version history.
7. Verify `/editor/pages`: empty state, create a synthetic page through `create_general_website_page`, Save Draft, bottom Live Preview, Publish, direct public route, then remove the synthetic record.

## Phase 2 — Build the resource editor foundation

1. Implement one typed resource registry for `service`, `team_member`, `blog_post`, `gallery_image`, and `review`.
2. Add strict Zod and database JSON-schema validation for every draft payload.
3. Add revision-checked publish/restore functions that write published tables only through audited database triggers/RPCs.
4. Keep browser grants presentation-only and keep `website_editor` unable to query operational or clinic tables.
5. Add a shared editor frame with Save Draft, Publish, history, conflict messaging, unsaved navigation protection, and a separate Live Preview section at the bottom.

## Phase 3 — Replace the six placeholders

1. **Services:** adapt the existing `LandingPages` fields to the new editor shell; preserve canonical service slugs, URL aliases, approved wording, and `sanitizeRichHtml`.
2. **Team:** adapt current team/doctor profile fields without exposing staff, payroll, roster, or private profile data.
3. **Blog:** adapt current blog form and sanitize rich output; use explicit public projections.
4. **Gallery:** add Website Media uploads with MIME/size/folder validation and immutable UUID filenames.
5. **Reviews:** use only `website_review_presentations`; never expose or query operational `clinic_reviews` from the Website Editor.
6. **Navigation:** add a private draft, strict URL/route validation, revision-checked atomic publish, and static navigation fallback.
7. Replace every `EditorUnavailableState` route with its real screen and add item-detail routes where needed.

## Phase 4 — Permissions and safety verification

1. Confirm `admin`, `special_admin`, `doctor_admin`, and `website_editor` can use all editor modules.
2. Confirm `website_editor` cannot enter `/clinic`, `/staff/admin`, patient, appointment, payment, payroll, inventory, role-management, secret, or private-storage surfaces.
3. Verify anonymous users can read only published presentation fields.
4. Run Supabase security advisors and resolve new CMS findings without suppressing them.
5. Test stale revisions, invalid rich HTML, unsafe URLs, disallowed uploads, and direct published-table mutation attempts.

## Phase 5 — Release

1. Run lint, TypeScript, Vitest, Deno tests, production/dev builds, dependency audit, and tracked-secret checks.
2. Open a review PR containing migrations, editor modules, tests, and no credentials or database export.
3. Apply reviewed migrations to `nhjbqdiyptjqherdfbqk` in timestamp order.
4. Deploy GitHub Pages only after Security Gate passes.
5. Perform desktop/mobile read-only checks on every editor and public route, then make one controlled draft/publish test per content type.

## Delivery order and stopping points

- Ship Phase 1 as a small recovery PR first. This restores Home and Pages quickly and independently.
- Ship Phases 2–3 in focused PRs: Services/Team/Blog, Gallery/Reviews, then Navigation.
- Do not reuse the old staff-administration routes directly for `website_editor`; reuse safe field components only.
- Do not modify public content implicitly. Draft saves remain private; publication always requires an explicit Publish action.
- Do not apply the duplicate-looking `20260722032157_229f6499-c9c6-413e-b659-052c2d5ac2f7.sql` until its relationship to already-applied CMS migrations is reconciled.
