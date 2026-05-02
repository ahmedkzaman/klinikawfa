## Status check

Tasks 3 & 4 from your prompt are **already in place** in `src/pages/tv/QueueTV.tsx`:
- `started` already initializes from `isPreview` (line 33).
- `ReactPlayer` is already imported and rendered with `volume={videoVolume}`, `muted={isPreview}`, and the bottom-left glass volume slider is already gated behind `!isPreview`.

So the remaining work is **Tasks 1, 2, and 5**: add a `tts_language` column, expose a language dropdown in settings, and make the TTS phrase + utterance language dynamic.

## Plan

### 1. DB migration — `clinic_settings.tts_language`
```sql
ALTER TABLE public.clinic_settings
ADD COLUMN IF NOT EXISTS tts_language text NOT NULL DEFAULT 'ms-MY';
```

### 2. `src/hooks/clinic/useClinicSettings.ts`
- Add `tts_language: 'ms-MY' | 'en-US'` to the `ClinicSettings` interface.
- Add `tts_language: 'ms-MY'` to the `DEFAULTS` constant so the field is always defined.

### 3. `src/pages/clinic/settings/QueueSettings.tsx`
In the Waiting Room TV card, add a third grid column (or a new row beside "Call patients by") with a shadcn `Select`:
- Label: "Announcement Language"
- Options: `ms-MY` → "Bahasa Melayu", `en-US` → "English"
- Local state `ttsLanguage`, hydrated from `settings.tts_language` in the existing `if (!hydrated …)` block.
- Include `tts_language: ttsLanguage` in the `update.mutateAsync({…})` payload inside `saveTv`.

### 4. `src/pages/tv/QueueTV.tsx` — dynamic TTS
Replace the hard-coded `speakMalay` body so the phrase and `msg.lang` follow `settings.tts_language`:

```ts
const lang = settings.tts_language ?? 'ms-MY';
const isMalay = lang === 'ms-MY';
const callBy = settings.queue_call_by ?? 'number';

const text = isMalay
  ? (callBy === 'name'
      ? `Pesakit, ${next.display}, sila ke, ${next.roomLabel}`
      : `Nombor giliran, ${next.display}, sila ke, ${next.roomLabel}`)
  : (callBy === 'name'
      ? `Patient, ${next.display}, please proceed to, ${next.roomLabel}`
      : `Queue number, ${next.display}, please proceed to, ${next.roomLabel}`);

const speakOnce = () => {
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = lang;
  msg.rate = 0.85;
  msg.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang.split('-')[0].toLowerCase();
  const voice =
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
  if (voice) msg.voice = voice;
  window.speechSynthesis.speak(msg);
};
```
Rename the function from `speakMalay` to `speakAnnouncement` (and update its call site) to reflect that it is no longer Malay-only. The existing `voiceschanged` fallback and repeat-once `setTimeout` logic are preserved.

### Files touched
- new SQL migration (`tts_language` column)
- `src/hooks/clinic/useClinicSettings.ts`
- `src/pages/clinic/settings/QueueSettings.tsx`
- `src/pages/tv/QueueTV.tsx`

No changes to `react-player`, the volume slider, or the preview-gate logic — those are already correct.