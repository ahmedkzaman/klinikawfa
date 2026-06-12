# Final Security Pass, Cleanup & CI/CD Gate

## 1. Create `.github/workflows/security-gate.yml`

New file. Triggers on `push` and `pull_request` to `main`. Single job `security-and-type-check` on `ubuntu-latest` with sequential steps:

1. `actions/checkout@v3`
2. `actions/setup-node@v3` (node 20, npm cache)
3. `npm ci`
4. `npm run lint`
5. `npx tsc --noEmit`
6. `npm test`
7. `npm run build`
8. `npm audit --omit=dev || true` (non-blocking)

No matrix, no extra jobs — minimal gate as spec'd.

## 2. PHI / Secret Log Audit on the 3 AI/TTS functions

Audit result of current `console.*` calls in `generate-bio/index.ts`, `generate-tts/index.ts`, `structure-medical-notes/index.ts`:

| Line | Statement | PHI/secret? | Action |
| --- | --- | --- | --- |
| bio:25, tts:20, notes:42 | `missing_api_key` literal tag | No | keep |
| bio:51 | `invoked by ${userId}` | No (uuid only) | keep |
| tts:32 | `invoked by ${userId} len=${text.length}` | No (metadata) | keep |
| notes:47 | `invoked by ${userId} len=${transcript.length}` | No (metadata) | keep |
| bio:101 / tts:48 / notes:91 | `ai_gateway_error` + numeric status | No | keep |
| bio:110, bio:119, tts:54, notes:100, notes:107 | static failure tags (`empty_ai_content`, `ai_parse_error`, `empty_audio`, `no_tool_call`, `parse_error`) | No | keep |

No raw transcripts, prompts, bio outputs, or API key values are logged today — the prior hardening pass already scrubbed them. **No edits to the three function files are required.** I will re-grep before finalizing to confirm nothing slipped in.

If anything turns up on the final grep (e.g. a `console.log(transcript)` or `console.log(content)`), it will be deleted or replaced with a metadata-only equivalent of the form `console.log('[fn] event', { userId, len })`.

## 3. `supabase/config.toml` sanity check

Current state already correct:

```
[functions.generate-bio]        verify_jwt = true
[functions.generate-tts]        verify_jwt = true
[functions.structure-medical-notes] verify_jwt = true
```

No `verify_jwt = false` entries on those three. No changes needed; will re-read in build mode to confirm before closing the task.

## Verification

- Re-grep `console\.` across the three function files.
- Re-read `supabase/config.toml` to confirm the three `verify_jwt = true` lines.
- Workflow YAML is lint-clean (2-space indent, quoted `on:` keys).

## Out of scope

- No frontend changes.
- No new RLS migrations.
- No edits to test files.
- Not flipping `npm audit` to blocking (spec says non-blocking).
