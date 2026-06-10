## Problem

The Doctor On Duty cards are falling back to the generic locum avatar even for Dr. Izzat because the roster stores the doctor's **full legal name** ("Muhammad Izzat Bin Mohd Adnin") while `/doctors` (and `team_members.photo_url`) uses the **display name** ("Dr. Izzat"). The current `includes()` check never matches these two strings, so the lookup fails.

`team_members` has no link column to staff users, so we must match by name. Currently both pages already read photos from the same source (`team_members.photo_url`) — the bug is purely in the matching logic.

## Fix

Update `src/pages/DoctorOnDuty.tsx` only:

1. **Token-based matcher** instead of substring `includes`:
   - Normalize both names (lowercase, strip punctuation, collapse spaces).
   - Strip honorifics/stopwords: `dr`, `doctor`, `mr`, `mrs`, `ms`, `bin`, `binti`, `bt`, `b`.
   - Split each into tokens.
   - A `team_members` entry matches a roster name when **any meaningful token** from the team member's `name_en`/`name_ms` (length ≥ 3) appears in the roster name's token set.
   - Example: team member tokens `["izzat"]` vs roster tokens `["muhammad","izzat","mohd","adnin"]` → match → use Dr. Izzat's `photo_url`.

2. **Locum / no-match behaviour unchanged**: fall back to the existing generic `locum-doctor-avatar.jpg`. Names that literally start with "Locum" skip the lookup entirely.

3. No DB or RPC changes; no other files touched.

## Verification

- Reload `/doctor-on-duty` and confirm S1 + S2 (Muhammad Izzat…) show the same photo as Dr. Izzat on `/doctors`.
- Confirm S3 (Locum) still shows the generic avatar.
- Visit `/doctors` and compare the two images are byte-identical (same `team-photos` URL).
