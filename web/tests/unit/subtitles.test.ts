import { describe, expect, it } from 'vitest';
import {
  formatLrcTime,
  formatSrtTime,
  getUntimedLines,
  parseSubtitles,
  serializeLrc,
  serializeSrt,
} from '../../src/domain/subtitles';

describe('subtitle parsing and export', () => {
  it('parses optional fractions and repeated LRC timestamps without losing milliseconds', () => {
    const cues = parseSubtitles('[01:02.125][00:02.5] 歌詞 | Translation\n[00:10] 第二句');
    expect(cues.map((cue) => cue.time)).toEqual([2.5, 10, 62.125]);
    expect(cues[0].subText).toBe('Translation');
    expect(cues[0].endTime).toBe(10);
  });
  it('preserves explicit SRT gaps and multilingual lines on round trip', () => {
    const raw =
      '1\r\n00:00:01,125 --> 00:00:02,750\r\n第一句\r\nTranslation\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\n第二句';
    const cues = parseSubtitles(raw);
    expect(cues[0].endTime).toBe(2.75);
    expect(cues[0].subText).toBe('Translation');
    expect(parseSubtitles(serializeSrt(cues))).toEqual(cues);
  });
  it('normalizes timestamps at minute boundaries', () => {
    expect(formatLrcTime(59.999)).toBe('[01:00.00]');
    expect(formatSrtTime(59.9998)).toBe('00:01:00,000');
  });
  it('rejects malformed input and removes metadata before sync', () => {
    expect(parseSubtitles('[00:90] invalid\n[ar:Artist]\nplain text')).toEqual([]);
    expect(getUntimedLines('[ar:Artist]\n[01:02.123] hello')).toEqual(['hello']);
  });
  it('exports SRT-imported cues as actual LRC', () => {
    const cues = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\nHello');
    expect(serializeLrc(cues)).toBe('[00:01.00] Hello');
  });
});
