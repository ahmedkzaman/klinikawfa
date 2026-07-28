import { describe, expect, it } from 'vitest';
import {
  applyTtsGain,
  applyTtsPlaybackSettings,
  buildGoogleMalayTtsUrl,
  buildGoogleCloudMalayTtsRequest,
  decodeBase64Audio,
  MAX_TTS_VOLUME,
  NORMAL_TTS_RATE,
  selectMalaySpeechVoice,
  TTS_GAIN_MULTIPLIER,
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

  it('plays Google announcements at normal speed and maximum volume', () => {
    const audio = { volume: 0.4, playbackRate: 1.2 };

    applyTtsPlaybackSettings(audio);

    expect(audio.volume).toBe(MAX_TTS_VOLUME);
    expect(audio.playbackRate).toBe(NORMAL_TTS_RATE);
    expect(MAX_TTS_VOLUME).toBe(1);
    expect(NORMAL_TTS_RATE).toBe(1);
  });

  it('applies the maximum configured caller amplification', () => {
    const gainNode = { gain: { value: 1 } };

    applyTtsGain(gainNode);

    expect(gainNode.gain.value).toBe(TTS_GAIN_MULTIPLIER);
    expect(TTS_GAIN_MULTIPLIER).toBe(3);
  });

  it('requests the official Malaysian Wavenet voice', () => {
    expect(buildGoogleCloudMalayTtsRequest('panggilan untuk siti aminah')).toEqual({
      text: 'panggilan untuk siti aminah',
      languageCode: 'ms-MY',
      voiceName: 'ms-MY-Wavenet-C',
    });
  });

  it('decodes Google Cloud base64 audio into bytes', () => {
    const bytes = new Uint8Array(decodeBase64Audio('AQID'));

    expect([...bytes]).toEqual([1, 2, 3]);
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
