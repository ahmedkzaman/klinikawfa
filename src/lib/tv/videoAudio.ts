export interface TvVideoAudioState {
  muted: boolean;
  volume: number;
}

export function createInitialTvVideoAudioState(): TvVideoAudioState {
  return {
    muted: true,
    volume: 0.5,
  };
}

export function toggleTvVideoMuted(
  state: TvVideoAudioState,
): TvVideoAudioState {
  return {
    ...state,
    muted: !state.muted,
  };
}
