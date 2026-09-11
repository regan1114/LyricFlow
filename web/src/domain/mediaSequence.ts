export type MediaKind = 'image' | 'video' | 'audio';
export type MediaTrack = 'V1' | 'A1' | 'A2';
export interface MediaClip {
  id: string;
  assetId: string;
  track: MediaTrack;
  start: number;
  duration: number;
  trimStart: number;
  volume: number;
  muted: boolean;
}
export function sequenceDuration(clips: MediaClip[]) {
  return clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
}
export function validateClip(clip: MediaClip, kind: MediaKind, sourceDuration: number) {
  return (
    [clip.start, clip.duration, clip.trimStart, clip.volume].every(Number.isFinite) &&
    clip.start >= 0 &&
    clip.duration >= 0.05 &&
    clip.trimStart >= 0 &&
    clip.volume >= 0 &&
    clip.volume <= 2 &&
    (kind === 'audio' ? clip.track !== 'V1' : clip.track === 'V1') &&
    (kind === 'image' || clip.trimStart + clip.duration <= sourceDuration + 0.001)
  );
}
export function audioWindow(clip: MediaClip, playhead: number) {
  const elapsed = Math.max(0, playhead - clip.start);
  return {
    delay: Math.max(0, clip.start - playhead),
    offset: clip.trimStart + elapsed,
    duration: clip.duration - elapsed,
  };
}
