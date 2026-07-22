# Existing-Database Website Editor Activation Design

**Status:** Approved

**Date:** 2026-07-21

## Objective

Activate the already-published Klinik Awfa website editor against the existing production Supabase database. Super administrators, administrators, doctor administrators, and dedicated website editors must be able to use the editor. A dedicated website editor must remain unable to enter the clinic, staff-administration, patient, financial, or operational systems.

## Confirmed Production Boundary

The production Supabase project is `ncysmppzfjtiekfnomdv`.

This is confirmed independently by:

- `supabase/config.toml`;
- the Supabase URL embedded in the deployed `https://klinikawfa.com` frontend bundle; and
- the `VITE_SUPABASE_*` secret names used by the successful GitHub Pages build.

The earlier project `nhjbqdiyptjqherdfbqk` is not the production target for this activation. No database, authentication, storage, or patient data will be copied or redirected to another project.

Anonymous Data API probes against the production project currently return `404` for `website_pages`, `website_page_drafts`, `website_navigation_items`, and the Google tracking columns. This establishes that the CMS migrations are not active in production even though the frontend code is published.

## Access Model

`special_admin` is the existing super-administrator role.

| Role | Website editor | Tracking settings | Clinic/admin systems |
|---|---:|---:|---:|
| `special_admin` | Allow | Allow | Preserve existing access |
| `admin` | Allow | Allow | Preserve existing access |
| `doctor_admin` | Allow | Allow | Preserve existing access |
| `website_editor` | Allow | Allow | Deny |
| `ops_staff` / `operations` / `staff` | Deny | Deny | Preserve existing access |
| `locum` / `resident_doctor` | Deny | Deny | Preserve existing access |
| `guest` / unauthenticated | Deny | Deny | Deny protected systems |

The capability is defined once in the frontend through `canManageWebsiteRole()` and once in the database through `private.can_manage_website()`. Both use the same four-role set. Tracking settings use the same role set through the separately named `canManageTrackingSettingsRole()` and `private.can_manage_tracking_settings()` capabilities.

The dedicated `website_editor` role must never be added to workforce, clinical, patient, private-storage, finance, or staff-administration authorization helpers.

## Architecture

The existing React editor under `/editor` remains the only website-management interface. It continues to cover the homepage, general pages, services, team and doctor profiles, blog posts, gallery, public review presentations, navigation, and consent-gated Google Analytics and Google Ads settings.

The existing Supabase project receives the six reviewed CMS migrations in their committed order:

1. `20260720111916_add_website_editor_role.sql`
2. `20260720115031_create_website_cms_foundation.sql`
3. `20260720225347_harden_website_cms_integration.sql`
4. `20260721035032_add_website_page_publishing.sql`
5. `20260721100403_switch_tracking_to_google.sql`
6. `20260721170000_create_general_website_page_rpc.sql`

These migrations create the editor role, CMS tables, RLS policies, website-media storage boundary, validated draft-and-publish workflow, Google tracking configuration, and guarded general-page creation RPC. They must be applied without editing historical migrations and without generating a second database.

The public site continues to render its committed default content when no published CMS row exists. Saving a draft does not change the public website. Only the existing explicit Publish action changes published CMS content.

## User Creation and Login Flow

Existing `special_admin`, `admin`, and `doctor_admin` accounts do not need role changes. Their current roles already imply website-management access.

An administrator creates a dedicated editor through the existing **Add Website Editor** action. The `admin-create-user` Edge Function accepts `website_editor` only from the three administrator tiers and does not create staff or doctor onboarding records for that role.

After login, a `website_editor` is sent to `/editor`. Administrator-tier users retain their normal clinic landing route and may open `/editor` directly or through the editor link. Route guards and database RLS independently enforce the same authorization.

## Activation Sequence

1. Confirm the connection resolves to `ncysmppzfjtiekfnomdv` before any privileged operation.
2. Export the current production database and record the current migration list.
3. Run read-only preflight checks for the existing role enum, required legacy tables and policies, and absence of partially created CMS objects.
4. Apply the six migrations in order to the same project.
5. Verify migration-history entries and every postflight guard.
6. Compare the live `admin-create-user` function with the committed implementation; deploy only if the live function lacks the reviewed website-editor role policy.
7. Create one synthetic website-editor account for validation, verify the access matrix, revoke its sessions, and delete it.
8. Test draft save, preview, media upload, publish, revision conflict handling, and unknown-page behavior with synthetic CMS content only. Remove synthetic content after verification.
9. Run database security advisors, application tests, production build, GitHub Security Gate, and live read-only smoke checks.
10. Leave Google tracking disabled unless valid Google IDs are deliberately configured later.

## Safety and Failure Handling

- Stop immediately if the connected project reference is not `ncysmppzfjtiekfnomdv`.
- Stop if the preflight finds unexpected existing CMS objects or migration-history drift; inspect rather than forcing the migrations.
- Do not expose or commit database passwords, service-role keys, publishable values, or local environment files.
- Do not modify patient, appointment, clinical, payment, insurance, staff, or existing public-content rows during activation.
- Do not use a service-role key in the browser or public bundle.
- Do not suppress migration, RLS, security-advisor, or GitHub Actions failures.
- If activation fails before a migration commits, rely on its transaction rollback. If a committed migration fails later validation, stop publication, preserve the database export, and use a separately reviewed forward-only corrective migration rather than editing migration history.

## Verification Criteria

Activation is complete only when all of the following are demonstrated:

- the production project reference is `ncysmppzfjtiekfnomdv` before and after activation;
- all six migration versions are recorded exactly once;
- all CMS tables and the `website-media` bucket exist with RLS enabled;
- `special_admin`, `admin`, `doctor_admin`, and `website_editor` can open and use `/editor`;
- the same four roles can manage consent-gated Google tracking settings;
- staff, operations, locum, resident-doctor, guest, and anonymous sessions cannot manage CMS resources;
- `website_editor` cannot enter `/clinic`, `/staff/admin`, or access patient, finance, workforce, or private-storage data;
- drafts do not alter the public site before Publish;
- the homepage preview remains in the separate bottom preview section;
- public pages retain their current content before any deliberate publish;
- all frontend, Deno, migration-regression, build, audit, and GitHub Actions gates pass; and
- no credentials or private environment files are tracked by Git.

## Out of Scope

- Creating or switching to a new Supabase project.
- Migrating patient or clinic data between projects.
- Changing existing public wording or media.
- Configuring live Google Analytics or Google Ads identifiers.
- Expanding website-editor access into administrative or clinic systems.
