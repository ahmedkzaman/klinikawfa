
## Plan: Fix the forgot-password flow so reset emails arrive and can actually be used

### What I found
- The app does call password reset from `src/contexts/AuthContext.tsx`.
- It sends users to `\`${window.location.origin}/auth/reset\`` after clicking the email link.
- But `src/App.tsx` has no `/auth/reset` route.
- I also did not find any dedicated recovery page that handles the recovery session and lets the user set a new password.

So there are likely 2 issues:
1. The recovery flow is incomplete in the app.
2. Email delivery/config still needs to be checked, because you’re not receiving the message at all.

### What I will do
1. **Fix the reset redirect path**
   - Update the reset flow to use a proper public reset-password route.

2. **Add a real password reset page**
   - Create a public page that:
     - accepts the recovery session from the email link
     - checks recovery state
     - lets the user enter a new password
     - calls `supabase.auth.updateUser({ password })`
   - Keep styling consistent with the current auth UI.

3. **Register the route**
   - Add the new reset-password page to `src/App.tsx` without changing other UI.

4. **Check auth email delivery setup**
   - Inspect the backend auth/email configuration and logs to confirm why the reset email is not arriving.
   - If auth email delivery is misconfigured, I’ll fix the minimum required setup without changing unrelated settings.

5. **Verify the full flow end-to-end**
   - Submit “Forgot password”
   - confirm the reset email is triggered
   - open the recovery link
   - reset the password successfully
   - confirm login works with the new password

### Files likely involved
- `src/contexts/AuthContext.tsx` — update reset redirect target
- `src/App.tsx` — add reset-password route
- `src/pages/ResetPassword.tsx` — new recovery/reset screen

### Notes
- This keeps the existing UI intact except for adding the missing reset-password screen.
- Even if email delivery is fixed, the current recovery experience is still incomplete until the route/page is added.
