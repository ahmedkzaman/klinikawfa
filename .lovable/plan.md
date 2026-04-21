
## Plan: Enable Leaked Password Protection

Turn on Supabase's HIBP (Have I Been Pwned) check so user passwords are validated against known breach databases at signup and password change.

### What changes
- Enable `password_hibp_enabled = true` on the project's auth config via the `configure_auth` tool.
- No code, schema, or UI changes required.

### Effect
- New signups and password resets will be rejected if the password appears in the HIBP breach corpus.
- Existing users are unaffected until they next change their password.
- The Security view warning `SUPA_auth_leaked_password_protection` will clear on the next scan.

### Files touched
- None.
