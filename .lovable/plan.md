## Migrate TV Announcements to Google Cloud TTS

Replace the unreliable browser `speechSynthesis` API with high-quality Google Cloud Text-to-Speech served via a Supabase Edge Function. Audio playback will be event-driven (no `setTimeout` racing).

### Prerequisite — Secret Required

`GOOGLE_TTS_API_KEY` is **not** currently configured. Before implementation I will request it via the secrets tool. The user will need to:
1. Create / open a Google Cloud project, enable **Cloud Text-to-Speech API**.
2. Create an API key (APIs & Services → Credentials → Create credentials → API key).
3. Restrict the key to the Text-to-Speech API.
4. Paste it into the Lovable secrets prompt.

Implementation pauses until the secret is saved.

---

### 1. New Edge Function — `supabase/functions/generate-tts/index.ts`

- Public POST endpoint with full CORS (`OPTIONS` preflight + `corsHeaders` on every response).
- Validates body via Zod: `{ text: string (1..5000), languageCode: string, voiceName: string }`.
- Reads `GOOGLE_TTS_API_KEY` from `Deno.env`.
- POSTs to `https://texttospeech.googleapis.com/v1/text:synthesize?key={KEY}` with:
  ```json
  {
    "input": { "text": "..." },
    "voice": { "languageCode": "...", "name": "..." },
    "audioConfig": { "audioEncoding": "MP3" }
  }
  ```
- Returns `{ audioContent: "<base64>" }` to the client. Surfaces upstream errors as 502 with sanitized message.
- No `verify_jwt` override needed (default applies).

### 2. Refactor `src/pages/tv/QueueTV.tsx`

**Remove** all references to:
- `window.speechSynthesis`
- `SpeechSynthesisUtterance`
- The `voiceschanged` listener
- The "prime" `speak(' ')` call inside the gate-screen Start button (replace with a no-op `new Audio().play()` unlock — needed so iOS/Safari allows later programmatic playback).

**Add** a single managed `currentAudioRef: HTMLAudioElement | null` so we can stop a stale clip if a new call arrives.

**`speakAnnouncement(next)` becomes async:**
1. Skip entirely if `isPreview`.
2. Determine:
   - `lang = settings.tts_language ?? 'ms-MY'`
   - `voiceName = lang === 'ms-MY' ? 'ms-MY-Wavenet-A' : 'en-US-Journey-F'`
   - `text` = same Malay/English phrasing already in place.
3. `const { data, error } = await supabase.functions.invoke('generate-tts', { body: { text, languageCode: lang, voiceName } })`.
4. On error → log + bail (queue still advances).
5. Build `audio = new Audio('data:audio/mp3;base64,' + data.audioContent)`, store in ref, `await audio.play()`.
6. Returns a Promise that resolves on `audio.onended` (and on `onerror` to avoid hangs).

**`processQueue()` rewrite (event-driven, no overlap):**
1. If `playingRef.current` → return.
2. Shift next call; if none → return.
3. `playingRef = true`; push to `recentCalls`.
4. `await playDingDong()` (chime keeps existing implementation; wraps `audio.onended` in a Promise so it also waits cleanly instead of `wait(900)`).
5. `await speakAnnouncement(next)` — first pass.
6. `await wait(800)` — short gap.
7. `await speakAnnouncement(next)` — repeat once for clarity (replaces the old `setTimeout(..., 2800)` repeat).
8. `playingRef = false`; if more queued → `processQueue()` recursively.

This guarantees: chime → first announcement → gap → repeat → next patient, with **zero overlap**, because every step awaits real `onended` events.

### 3. Files Touched

- **NEW** `supabase/functions/generate-tts/index.ts`
- **EDIT** `src/pages/tv/QueueTV.tsx`

No DB migration, no other file changes. The existing `tts_language` setting and language dropdown remain unchanged.

### 4. Verification

After deploy I will:
- Curl the edge function with a short Malay sample to confirm it returns base64.
- Confirm no `speechSynthesis` references remain (`rg speechSynthesis src`).
- Confirm preview iframe still mutes audio (`isPreview` early-returns are preserved).
