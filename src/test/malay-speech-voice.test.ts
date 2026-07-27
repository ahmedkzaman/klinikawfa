import { describe, expect, it } from 'vitest';
import { selectMalaySpeechVoice } from '@/lib/tv/speechVoice';

const voice = (name: string, lang: string, localService = true) => ({
  name,
  lang,
  localService,
  default: false,
  voiceURI: name,
});

describe('Malay TV caller voice selection', () => {
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
