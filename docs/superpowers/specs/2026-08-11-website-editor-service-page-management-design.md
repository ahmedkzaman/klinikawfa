# Website Editor Service Page Management Design

## Goal

Allow authorized Website Editor users to create and delete dynamic service landing pages directly from **Website Editor → Services**, while keeping the existing Landing Pages administration screen synchronized and protecting core service pages.

## User experience

- The Services page displays a **Create service page** action.
- Selecting it opens the same landing-page form and validation used by the existing Landing Pages screen.
- A successful creation closes the form and immediately refreshes the Services list.
- Every dynamic landing-page row displays **Edit content** and **Delete** actions.
- Delete opens a confirmation dialog explaining that the public URL will stop working.
- Successful deletion immediately removes the row from both Website Editor and Landing Pages.
- Duplicate slugs, invalid fields, upload failures, permission failures, and deletion failures produce clear messages without closing the form or removing the row.

## Protected pages

The following database service slugs are core pages and cannot be deleted:

- `rawatan-am`
- `prosedur-minor`
- `pemeriksaan-kesihatan`

Protection is enforced in the shared UI and by the database deletion function. Static canonical SEO-only targets remain non-deletable because they are not database landing-page records.

## Architecture

Extract the existing landing-page form, media upload behavior, validation, save operation, and delete confirmation into shared Website CMS components and API helpers. Both the legacy Landing Pages screen and Website Editor Services screen use these shared units.

The Website Editor list continues to combine canonical SEO targets with all `clinic_services` records. Creation uses `save_clinic_landing_page`; deletion uses `delete_clinic_landing_page`. React Query invalidation refreshes both relevant query keys so either administration screen reflects a change immediately.

## Authorization and safety

- Existing Website Editor route authorization remains the first access control layer.
- Supabase functions continue to enforce server-side authorization.
- The delete function rejects protected core slugs even if called outside the UI.
- Slugs remain immutable after creation to preserve public links and SEO history.
- Deletion is permanent and always requires explicit confirmation.
- Media assets are not automatically deleted with a page, preventing accidental removal of files that may be reused elsewhere.

## Testing and verification

- Component test: Create action is visible in Website Editor Services.
- Component test: dynamic rows expose Delete; protected core rows do not.
- Component test: successful create/delete refreshes the service list.
- Component test: failed operations show an error and preserve UI state.
- Schema/API test: dynamic slugs remain supported.
- PostgreSQL contract test: authorized deletion succeeds for a dynamic page and fails for protected core pages.
- Run focused Website CMS tests, lint changed files, type checking, production build, and the repository security/deployment gates.

## Out of scope

- Deleting canonical SEO-only pages.
- Automatically deleting uploaded media.
- Changing an existing page slug.
- Adding a recycle bin or restore workflow.
