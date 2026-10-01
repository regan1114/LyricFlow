import {
  validateProject,
  type LyricProject,
  type LyricWord,
} from '../../../packages/lyrics-timeline/index.ts';
import type { SubtitleCue } from './subtitles';
import type { MediaClip } from './mediaSequence';
export { validateProject, type LyricProject, type LyricWord };

export const isTimeline = (raw: string) => raw.trimStart().startsWith('{');
export function timelineCues(project: LyricProject): SubtitleCue[] {
  return validateProject(project).segments.map((segment, index) => ({
    uid: `lyric-${segment.id}`,
    segmentId: segment.id,
    time: segment.start,
    endTime: segment.end,
    text: segment.text,
    subText: '',
    thirdText: '',
    animType: index % 12,
    words: segment.words,
    confidence: segment.confidence,
  }));
}
export function cuesProject(
  cues: SubtitleCue[],
  mode: LyricProject['mode'] = 'import',
  duration = 0,
): LyricProject {
  const used = new Set<number>();
  let next = Math.max(0, ...cues.map((cue) => cue.segmentId ?? 0)) + 1;
  return validateProject({
    version: '1.0.0',
    mode,
    duration: Math.max(duration, ...cues.map((cue) => cue.endTime), 0),
    segments: cues.map((cue) => {
      const id = cue.segmentId && !used.has(cue.segmentId) ? cue.segmentId : next++;
      used.add(id);
      const text = [cue.text, cue.subText, cue.thirdText].filter(Boolean).join('\n');
      const words = cue.words?.map((word) => word.text).join('') === text ? cue.words : undefined;
      return {
        id,
        start: cue.time,
        end: cue.endTime,
        text,
        ...(words ? { words } : {}),
        ...(cue.confidence === undefined ? {} : { confidence: cue.confidence }),
      };
    }),
  });
}
export function serializeTimeline(cues: SubtitleCue[], previous: string): string {
  const old = isTimeline(previous) ? validateProject(JSON.parse(previous)) : undefined;
  return JSON.stringify(cuesProject(cues, old?.mode, old?.duration));
}
export function mapTimeline(value: LyricProject, clips: MediaClip[]): LyricProject {
  const source = validateProject(value);
  const segments = clips
    .flatMap((clip) =>
      source.segments.flatMap((segment) => {
        const start = Math.max(segment.start, clip.trimStart),
          end = Math.min(segment.end, clip.trimStart + clip.duration);
        if (end <= start) return [];
        const shift = clip.start - clip.trimStart;
        // A cropped word is no longer first complete acoustic unit; use sentence fallback.
        const words =
          start === segment.start && end === segment.end
            ? segment.words?.map((word) => ({
                ...word,
                start: word.start + shift,
                end: word.end + shift,
              }))
            : undefined;
        return [{ ...segment, words, start: start + shift, end: end + shift }];
      }),
    )
    .sort((first, second) => first.start - second.start)
    .map((segment, index) => ({ ...segment, id: index + 1 }));
  return validateProject({
    ...source,
    duration: Math.max(0, ...clips.map((cue) => cue.start + cue.duration)),
    segments,
  });
}
export function shiftWords(words: LyricWord[] | undefined, offset: number) {
  return words?.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset }));
}
