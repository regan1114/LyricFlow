import { expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  validateProject,
  timelineSrt,
  type LyricProject,
} from '../../../packages/lyrics-timeline/index.ts';
import { mapTimeline } from '../../src/domain/lyricsTimeline';
import { parseSubtitles } from '../../src/domain/subtitles';
import { useSubtitleEditor } from '../../src/composables/useSubtitleEditor';
import { wordHighlightSpans } from '../../src/engine/wordHighlight';
import { useAutoRecognition } from '../../src/composables/useAutoRecognition';
const project = (): LyricProject => ({
  version: '1.0.0',
  mode: 'known_lyrics',
  duration: 40,
  segments: [
    {
      id: 1,
      start: 14.7,
      end: 19.9,
      text: '月滿，歸來。',
      words: [
        { text: '月滿，', start: 14.7, end: 16 },
        { text: '歸來。', start: 18, end: 19.9 },
      ],
    },
    { id: 2, start: 25, end: 28, text: '月滿，歸來。' },
  ],
});
it('validates seconds, preserves original text, emits SRT and rejects malformed words', () => {
  const timeline = project();
  expect(timelineSrt(timeline)).toContain('00:00:14,700 --> 00:00:19,900');
  expect(timelineSrt(timeline)).toContain('月滿，歸來。');
  timeline.segments[0].words![1].end = 20;
  expect(() => validateProject(timeline)).toThrow();
  for (const value of [NaN, Infinity, -1])
    expect(() => validateProject({ ...project(), duration: value })).toThrow();
});
it('projects clipped/moved/repeated audio and drops partial words without losing sentences', () => {
  const clip = {
    id: 'a',
    assetId: 'song',
    track: 'A1' as const,
    start: 10,
    trimStart: 15,
    duration: 14,
    volume: 1,
    muted: false,
  };
  const timeline = mapTimeline(project(), [clip, { ...clip, start: 40 }]);
  expect(timeline.segments).toHaveLength(4);
  expect(timeline.segments[0].start).toBe(10);
  expect(timeline.segments[0].words).toBeUndefined();
  expect(new Set(timeline.segments.map((segment) => segment.id)).size).toBe(4);
});
it('keeps word timings through move, undo, JSON persistence; trims/text edits fall back to sentences', () => {
  const raw = ref(JSON.stringify(project()));
  const editor = useSubtitleEditor(raw, () => false);
  const first = editor.items.value[0];
  editor.update(first.uid, { time: 15.7, endTime: 20.9 });
  expect(parseSubtitles(raw.value)[0].words![0].start).toBe(15.7);
  editor.undo();
  expect(parseSubtitles(raw.value)[0].words![0].start).toBe(14.7);
  editor.update(first.uid, { endTime: 19 });
  expect(parseSubtitles(raw.value)[0].words).toBeUndefined();
  editor.undo();
  editor.update(first.uid, { text: '正確歌詞' });
  expect(parseSubtitles(raw.value)[0].words).toBeUndefined();
});
it('splits text without duplicating all lyrics, merges selected cues and preserves undo', () => {
  const raw = ref(JSON.stringify(project()));
  const editor = useSubtitleEditor(raw, () => false);
  editor.selectedId.value = editor.items.value[0].uid;
  editor.split(17);
  expect(
    editor.items.value
      .slice(0, 2)
      .map((cue) => cue.text)
      .join(''),
  ).toBe('月滿，歸來。');
  editor.selectMany(editor.items.value.slice(0, 2).map((cue) => cue.uid));
  editor.merge();
  expect(editor.items.value).toHaveLength(2);
  editor.undo();
  expect(editor.items.value).toHaveLength(3);
  expect(
    new Set(validateProject(JSON.parse(raw.value)).segments.map((segment) => segment.id)).size,
  ).toBe(3);
});
it('uses acoustic word times and falls back cleanly without words and in instrumental gaps', () => {
  const cues = parseSubtitles(JSON.stringify(project()));
  expect(wordHighlightSpans(cues[0], 17).map((word) => word.progress)).toEqual([1, 0]);
  expect(wordHighlightSpans(cues[0], 20)).toEqual([]);
  expect(wordHighlightSpans(cues[1], 26)).toEqual([]);
});
it('applies known lyrics as structured JSON, preserving words rather than going through SRT', async () => {
  const json = (body: unknown) => new Response(JSON.stringify(body));
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ alignment: { ready: true } }))
      .mockResolvedValueOnce(json({ id: 'job' }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ status: 'done' }))
      .mockResolvedValueOnce(json(project())),
  );
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  const result = await recognition.start(
    new File(['audio'], 'song.wav'),
    '月滿',
    [
      {
        id: 'a',
        assetId: 'song',
        track: 'A1',
        start: 0,
        trimStart: 0,
        duration: 40,
        volume: 1,
        muted: false,
      },
    ],
    apply,
    { mode: 'known_lyrics' },
  );
  expect(result).toBe(true);
  expect(JSON.parse(apply.mock.calls[0][0]).segments[0].words).toHaveLength(2);
  vi.unstubAllGlobals();
});
