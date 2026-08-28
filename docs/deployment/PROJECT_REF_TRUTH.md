# Supabase Project Reference — Source of Truth

**Status:** Authoritative. If any doc, script, or config conflicts with this file, this file wins.

## The one that matters

| Purpose | Project ref | Notes |
|---|---|---|
| **PRODUCTION (live backend)** | `nhjbqdiyptjqherdfbqk` | All clinic data, auth, storage, edge functions. Wired into `src/config/supabase-build-config.ts`, `public/_headers` CSP, and CI secrets (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PUBLISHABLE_KEY`). |
| Historical / retired | `ncysmppzfjtiekfnomdv` | Original Lovable Cloud project. **Not connected to anything live.** |

## Rules

1. **Before any Edge Function deploy, `db push`, or migration against production:** verify the target ref is `nhjbqdiyptjqherdfbqk`. Check `supabase/config.toml` `project_id` and/or pass `--project-ref nhjbqdiyptjqherdfbqk` explicitly.
2. `docs/superpowers/plans/` and `docs/superpowers/specs/` are **historical planning records**, not current truth. Several (notably the 2026-07-21/22 cutover docs) describe `ncysmppzfjtiekfnomdv` as the live source and `nhjbqdiyptjqherdfbqk` as an unused target — that plan was **abandoned and reversed in practice**; `nhjbqdiyptjqherdfbqk` has been production since before 2026-08. Do not "fix" those docs to match current reality; treat them as archives.
3. `scripts/cutover/*` similarly encode the abandoned cutover attempt (e.g. `cutover-contract.mjs` hardcodes `LIVE_SOURCE_PROJECT_REF = "ncysmppzfjtiekfnomdv"`). They are kept for their test/assertion logic, not as deployment instructions.
4. Migrations are applied manually via the Supabase SQL Editor against `nhjbqdiyptjqherdfbqk` (see `docs/deployment/` runbooks).

## Quick verification

```sh
# What does the local CLI think?
grep '^project_id' supabase/config.toml
# Expected: "nhjbqdiyptjqherdfbqk"

# What does the live site actually talk to?
curl -s https://klinikawfa.com/ | grep -o 'https://[a-z0-9]*\.supabase\.co' | sort -u
# Expected: https://nhjbqdiyptjqherdfbqk.supabase.co
```
