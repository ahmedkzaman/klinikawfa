
Fix the real cause in auth/session handling, not just the payroll page.

1. Update `src/contexts/AuthContext.tsx`
   - Replace the current `loading`/`currentUserId` closure check with refs so the auth listener always sees the latest initialized state.
   - Initialize the current user ref from `getSession()` as soon as the first session is loaded.
   - Ignore redundant `TOKEN_REFRESHED` / `INITIAL_SESSION` events when the authenticated user has not changed and auth is already initialized.
   - Only refetch roles when the user actually changes, signs in, or signs out.

2. Prevent full layout reset on harmless auth refresh
   - Keep `rolesLoading` from flipping back to loading during background token refresh for the same user.
   - This stops `StaffLayout` from returning the global spinner and unmounting the payroll dialog while editing.

3. Tighten the payroll editor UX
   - In `src/pages/staff/admin/PayrollProfiles.tsx`, preserve the dialog/form state independently from background query refreshes.
   - Ensure invalidating `admin-payroll-profiles` after save does not overwrite in-progress edits if the dialog remains open.

4. Clean up the payroll dialog warnings seen in console
   - Fix the `Select` ref warning in `PayrollProfiles` by checking how the select is composed inside the dialog/form and aligning it with the existing UI component pattern.
   - Add a dialog description or `aria-describedby={undefined}` to remove the accessibility warning.
   - These warnings are probably not the tab-switch root cause, but they should be fixed because they can interfere with stable modal behavior.

5. Verify affected areas
   - Confirm the payroll edit dialog stays open with unsaved values after switching browser tabs.
   - Confirm other staff/admin pages that depend on `AuthContext` no longer flash loading on tab focus.

Technical note:
The current listener uses `loading` from the effect closure. Because that value stays at its initial `true` inside the subscription callback, this condition never reliably short-circuits:
```ts
if (
  (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') &&
  session?.user?.id === currentUserId &&
  !loading
) {
  return;
}
```
So when the tab regains focus and auth refreshes, the app re-applies session state and role loading, which makes `StaffLayout` render the full-screen loader and effectively resets the payroll editing UI.
