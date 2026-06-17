# Final privacy pass on edge functions

Verified current state. Plan covers only what's actually still present in the repo.

## 1. `video-room` — drop `patient_name` from lookup (MUST)

**`supabase/functions/video-room/index.ts`** line 53–77: the public `GET ?action=lookup` returns the full row including `patient_name`. Any visitor with a guessable room code could enumerate names.

- Line 55: change `select("id, room_code, status, deposit_amount, per_minute_rate, patient_name")` → `select("id, room_code, status, deposit_amount, per_minute_rate")`.
- No frontend change needed — the lookup response is consumed only to gate access; patient_name is fetched separately via authenticated paths.

Also tighten line 312 (admin delete path) `select("id, status, patient_name")` → `select("id, status")` — `patient_name` is selected but never used after the earlier log-redaction pass.

## 2. `generate-blog-content` — strip prompt/response content from logs (MUST)

**`supabase/functions/generate-blog-content/index.ts`**:
- Line 125: `console.log("Generating blog content for:", body.topic)` → `console.log("generate_blog_start", { userId: user.id })`.
- Line 227: `console.error("Raw content:", content)` → `console.error("generate_blog_parse_failed", { contentLength: content?.length ?? 0 })`.
- Line 237: `console.log("Blog content generated successfully")` → leave (already metadata-free) or tighten to `console.log("generate_blog_ok", { userId: user.id })`.
- Line 244: `console.error("Error generating blog content:", error)` → `console.error("generate_blog_unhandled", { name: error instanceof Error ? error.name : typeof error })`.

## 3. Rate limiting (NOT in this plan)

Project policy: backend has no standard rate-limiting primitive, scanner findings recommending it are ignored. `submit-appointment` already has a per-IP-hash limiter via `record_appointment_submission` RPC; `video-room` lookup and `video-payment` do not. If you want an ad-hoc per-IP-hash limiter on `video-room?action=lookup` (highest-value protection — it's the only endpoint that maps room_code → some info), say the word and I'll add it as a separate change. Default is to skip.

## 4. Tag-only logs across patient-touching functions (NOT in this plan)

Already done in prior turn for `video-room`, `video-payment`, `publish-scheduled-posts`, `submit-appointment`. After item 2 above, `generate-blog-content` will also be clean. No remaining offenders.

## Verification (after build mode)

```
rg -n "patient_name" supabase/functions/video-room/index.ts
# expect: only POST-create/update branches that write the column, no select() hits

rg -n "body\.topic|Raw content|Error generating" supabase/functions/generate-blog-content/index.ts
# expect: zero matches
```

## Out of scope

- No frontend changes.
- No DB / RLS changes.
- No rate-limiting code (see item 3).
