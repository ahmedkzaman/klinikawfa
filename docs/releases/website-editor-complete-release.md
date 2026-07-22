# Website Editor Complete Release

## Scope

This release activates the WordPress-inspired Website Editor for the approved
`admin`, `special_admin`, `doctor_admin`, and `website_editor` roles. It covers
Home, pages, posts, services, team profiles, gallery, reviews, navigation,
public media, SEO, and consent-gated Google Analytics / Google Ads settings.

The `website_editor` role remains outside clinic operations, patient records,
appointments, payments, payroll, inventory, staff administration, role
management, private Storage, and secrets.

## Active backend

- Supabase project: `nhjbqdiyptjqherdfbqk`
- The live `klinikawfa.com` frontend bundle was verified to reference this
  project and not the previous Lovable project.
- Migration `20260723090000_add_wordpress_editor_foundation.sql` is applied and
  recorded.
- Migration
  `20260723093000_require_clinical_role_for_consultation_doctor.sql` is applied
  and recorded.
- The `publish-scheduled-content` Edge Function is active with JWT verification
  disabled at the gateway and its own `CRON_SECRET` check enforced by the
  handler.

## Backup and rollback points

- Pre-migration database backup:
  `C:\Users\ahmed\Documents\Codex\private\klinikawfa\backups\wordpress-editor-staging-before-20260723-030058.backup`
- SHA-256:
  `3B4870DB92D99C2D657BA25786C99D2677A2304528E6436D4FC95BA8FBFCF0D6`
- Frontend rollback: redeploy the preceding GitHub Pages artifact or revert the
  merge commit.
- Database rollback is restore-only from the backup. No destructive down
  migration is shipped.

## Security evidence

- A transactional Website Editor role simulation proved access to CMS lifecycle
  and public-media metadata while denying appointments, consultations,
  payments, and panel claims.
- Anonymous access to private Media Library metadata is denied.
- A legitimate resident doctor retained access to exactly their own active
  payments after the clinical-role boundary migration.
- A disposable authenticated Website Editor opened every editor route, loaded
  the Home revision and bottom Desktop/Mobile preview, and was redirected away
  from clinic, staff, and administrative routes. The Auth user and role row were
  deleted afterward, with zero records remaining.
- The scheduled publisher rejects requests without its secret with HTTP 401.

## Editor acceptance evidence

- No editor route displays the former unavailable placeholder.
- Home loads the existing published revision and matching private draft.
- Home provides an active public-media upload control for the background image;
  the obsolete disabled resources-phase placeholder was removed.
- Draft, publish, history, restore-to-draft, stale-revision handling, unsaved
  navigation protection, and the separate bottom Desktop/Mobile preview are
  covered by automated tests.
- The public homepage, services, service detail, doctors, gallery, and health
  tips routes rendered without 404s or console errors during staging checks.
- Desktop and 390-pixel mobile homepage checks passed without horizontal
  overflow.

## Validation commands

- TypeScript: `tsc --noEmit`
- Changed files: ESLint
- Home and Media regression suite: 22/22 passing
- Production build: passing
- Development-mode build: passing
- GitHub Security Gate must pass for the final pull-request commit before merge.

## Release order

1. Merge the reviewed pull request only after the exact head commit is green.
2. Confirm both migrations remain recorded and the Edge Function remains active.
3. Allow GitHub Pages to deploy the merge commit.
4. Verify HTTPS, homepage background, public routes, editor routes, role
   isolation, browser console, and public Supabase reads.
5. If the frontend verification fails, redeploy the preceding Pages artifact or
   revert the merge. Do not roll back the already-compatible database objects
   unless a database-specific failure is confirmed.

