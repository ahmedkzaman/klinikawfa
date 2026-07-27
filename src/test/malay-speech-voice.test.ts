import { describe, expect, it } from 'vitest';
import {
  applyTtsPlaybackSettings,
  buildGoogleMalayTtsUrl,
  selectMalaySpeechVoice,
} from '@/lib/tv/speechVoice';

const voice = (name: string, lang: string, localService = true) => ({
  name,
  lang,
  localService,
  default: false,
  voiceURI: name,
});

describe('Malay TV caller voice selection', () => {
  it('builds a Google Malay TTS request with encoded announcement text', () => {
    const url = new URL(buildGoogleMalayTtsUrl('Panggilan untuk Nur Aisyah.'));

    expect(url.hostname).toBe('translate.google.com');
    expect(url.searchParams.get('tl')).toBe('ms');
    expect(url.searchParams.get('q')).toBe('Panggilan untuk Nur Aisyah.');
  });

  it('plays Google announcements at full volume and a faster rate', () => {
    const audio = { volume: 0.4, playbackRate: 1 };

    applyTtsPlaybackSettings(audio);

    expect(audio.volume).toBe(1);
    expect(audio.playbackRate).toBe(1.2);
  });

  it('prioritizes an exact Malaysian Malay voice over an English default', () => {
    const selected = selectMalaySpeechVoice([
      voice('Microsoft Zira', 'en-US'),
      voice('Microsoft Yasmin', 'ms-MY'),
    ] as SpeechSynthesisVoice[]);

    expect(selected?.lang).toBe('ms-MY');
  });

  it('uses Indonesian as a closer fallback when Malaysian Malay is unavailable', () => {
    const selected = selectMalaySpeechVoice([
      voice('Microsoft Zira', 'en-US'),
      voice('Google Bahasa Indonesia', 'id-ID'),
    ] as SpeechSynthesisVoice[]);

    expect(selected?.lang).toBe('id-ID');
  });

  it('does not select an English voice for a Malay announcement', () => {
    const selected = selectMalaySpeechVoice([
      voice('Microsoft Zira', 'en-US'),
    ] as SpeechSynthesisVoice[]);

    expect(selected).toBeNull();
  });
});
