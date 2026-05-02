## Replace local ding-dong with Supabase-hosted chime

### Goal
Swap the local `/sounds/dingdong.mp3` chime for a professional chime hosted in the public `assets` bucket on Lovable Cloud, capped at 3 seconds so the Google TTS announcement starts promptly.

### Prerequisite (user action)
Upload the chime file to the **`assets`** storage bucket (already public) with the path **`clinic-chime.mp3`**. The resulting public URL will be:

```
https://ncysmppzfjtiekfnomdv.supabase.co/storage/v1/object/public/assets/clinic-chime.mp3
```

If you'd prefer a different filename or bucket, let me know before I implement.

### Changes

**1. `src/pages/tv/QueueTV.tsx`**

- Add a top-level constant:
  ```ts
  const CHIME_URL = "https://ncysmppzfjtiekfnomdv.supabase.co/storage/v1/object/public/assets/clinic-chime.mp3";
  ```
- Remove the two `<audio ref={audioRef} src="/sounds/dingdong.mp3" ...>` elements (lines 260 & 277) — we'll create the Audio object on demand so the URL is centralized and the element isn't needed.
- Rewrite `playDingDong` to:
  - Skip in preview mode (unchanged).
  - Create `new Audio(CHIME_URL)`, set `volume = 0.6`, call `play()`.
  - Return a Promise that resolves on `ended` **or** after a 3000 ms safety timeout (whichever fires first), and also on `error` so the queue never hangs. The timeout pauses the audio so it stops audibly at ~3s.
  - Keep the existing synthesized WebAudio two-tone fallback if `play()` rejects (e.g. autoplay blocked, network failure).
- The downstream `await playDingDong(); ... speakAnnouncement(...)` flow at line 222 continues to work unchanged — TTS still starts only after the chime promise resolves.

### Technical notes
- `audioRef` and the `<audio>` elements become unused; remove the ref declaration too if nothing else references it (will verify during implementation).
- The 3-second cap matches the first "ding-dong" of the referenced 11-second clip; adjustable via a single constant.
- No DB migration, no edge function changes, no new secrets.