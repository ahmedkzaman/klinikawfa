function normalizedLanguage(language: string): string {
  return language.trim().toLowerCase().replace('_', '-');
}

export const NORMAL_TTS_RATE = 1;
export const MAX_TTS_VOLUME = 1;
export const TTS_GAIN_MULTIPLIER = 3;

export function buildGoogleMalayTtsUrl(text: string): string {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', 'ms');
  url.searchParams.set('q', text);
  return url.toString();
}

export function buildGoogleCloudMalayTtsRequest(text: string) {
  return {
    text,
    languageCode: 'ms-MY',
    voiceName: 'ms-MY-Wavenet-C',
  };
}

export function decodeBase64Audio(audioContent: string): ArrayBuffer {
  const binary = atob(audioContent);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function applyTtsPlaybackSettings(
  audio: Pick<HTMLAudioElement, 'volume' | 'playbackRate'>,
): void {
  audio.volume = MAX_TTS_VOLUME;
  audio.playbackRate = NORMAL_TTS_RATE;
}

export function applyTtsGain(
  gainNode: Pick<GainNode, 'gain'>,
): void {
  gainNode.gain.value = TTS_GAIN_MULTIPLIER;
}

export function selectMalaySpeechVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  const exactMalay = voices.filter(
    (voice) => normalizedLanguage(voice.lang) === 'ms-my',
  );
  const anyMalay = voices.filter((voice) =>
    normalizedLanguage(voice.lang).startsWith('ms'),
  );
  const indonesian = voices.filter((voice) =>
    normalizedLanguage(voice.lang).startsWith('id'),
  );

  const rank = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    const naturalMalayName =
      name.includes('yasmin') ||
      name.includes('rizwan') ||
      name.includes('malay') ||
      name.includes('bahasa melayu') ||
      name.includes('malaysia');
    return (naturalMalayName ? 4 : 0) + (voice.localService ? 1 : 0);
  };

  const preferredGroup =
    exactMalay.length > 0 ? exactMalay : anyMalay.length > 0 ? anyMalay : indonesian;

  return [...preferredGroup].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

export async function waitForSpeechVoices(
  synthesizer: SpeechSynthesis,
  timeoutMs = 2500,
): Promise<SpeechSynthesisVoice[]> {
  const initial = synthesizer.getVoices();
  if (initial.length > 0) return initial;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synthesizer.removeEventListener('voiceschanged', finish);
      resolve(synthesizer.getVoices());
    };

    synthesizer.addEventListener('voiceschanged', finish);
    window.setTimeout(finish, timeoutMs);
  });
}
