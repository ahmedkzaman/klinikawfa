import { describe, expect, it } from 'vitest';
import {
  createInitialTvVideoAudioState,
  toggleTvVideoMuted,
} from '@/lib/tv/videoAudio';

describe('TV video audio defaults', () => {
  it('starts the waiting-room video muted', () => {
    expect(createInitialTvVideoAudioState()).toEqual({
      muted: true,
      volume: 0.5,
    });
  });

  it('allows the video to be unmuted manually', () => {
    expect(toggleTvVideoMuted(createInitialTvVideoAudioState())).toEqual({
      muted: false,
      volume: 0.5,
    });
  });
});
