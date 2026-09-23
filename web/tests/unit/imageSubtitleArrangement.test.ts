import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  embeddedImageFile,
  parseImageSubtitleArrangement,
} from '../../src/domain/imageSubtitleArrangement';
import { parseSubtitles } from '../../src/domain/subtitles';

const first =
  '1\n00:00:01,000 --> 00:00:03,000\n第一句\n\n2\n00:00:04,000 --> 00:00:05,000\n第二句';
const later = '3\n00:00:06,000 --> 00:00:08,000\n第三句';
const json = (scenes: unknown[]) => JSON.stringify({ version: 1, scenes });

describe('image subtitle JSON', () => {
  it('fills image gaps from zero while preserving subtitle times and sorting name references', () => {
    const result = parseImageSubtitleArrangement(
      json([
        { name: 'later.png', startTime: 6, endTime: 8.25, content: '第三句' },
        { name: ' first.png ', startTime: 1.125, endTime: 3, content: '第一句' },
        { name: 'first.png', startTime: 4, endTime: 5, content: '第二句' },
      ]),
    );
    expect(result.scenes.map(({ image, start, duration }) => ({ image, start, duration }))).toEqual(
      [
        { image: 'first.png', start: 0, duration: 4 },
        { image: 'first.png', start: 4, duration: 2 },
        { image: 'later.png', start: 6, duration: 2.25 },
      ],
    );
    expect(
      parseSubtitles(result.subtitles).map(({ time, endTime, text }) => ({ time, endTime, text })),
    ).toEqual([
      { time: 1.125, endTime: 3, text: '第一句' },
      { time: 4, endTime: 5, text: '第二句' },
      { time: 6, endTime: 8.25, text: '第三句' },
    ]);
  });

  it('rounds times to milliseconds and preserves nonempty lines of content', () => {
    const result = parseImageSubtitleArrangement(
      json([
        {
          image: 'picture.png',
          startTime: 1.0004,
          endTime: 1.0504,
          content: '歌詞\r\n\r\nTranslation\n第三行\n第四行',
        },
      ]),
    );
    expect(result.scenes[0]).toMatchObject({ start: 0, duration: 1.05 });
    expect(parseSubtitles(result.subtitles)[0]).toMatchObject({
      time: 1,
      endTime: 1.05,
      text: '歌詞',
      subText: 'Translation',
      thirdText: '第三行\n第四行',
    });
  });

  it.each([
    ['missing start', { endTime: 2, content: '歌詞' }, 'startTime'],
    ['missing end', { startTime: 0, content: '歌詞' }, 'endTime'],
    ['string time', { startTime: '0', endTime: 2, content: '歌詞' }, '秒數'],
    ['negative time', { startTime: -1, endTime: 2, content: '歌詞' }, '秒數'],
    ['null time', { startTime: null, endTime: 2, content: '歌詞' }, '秒數'],
    ['nonfinite time', { startTime: 0, endTime: Infinity, content: '歌詞' }, '秒數'],
    ['reversed interval', { startTime: 2, endTime: 1, content: '歌詞' }, '至少 0.05 秒'],
    ['short interval', { startTime: 1, endTime: 1.049, content: '歌詞' }, '至少 0.05 秒'],
    ['missing content', { startTime: 0, endTime: 2 }, 'content'],
    ['empty content', { startTime: 0, endTime: 2, content: ' \n ' }, 'content'],
    ['nontext content', { startTime: 0, endTime: 2, content: 123 }, 'content'],
    ['partial new fields with legacy data', { startTime: 0, srt: first }, 'endTime'],
  ])('rejects invalid explicit fields: %s', (_name, fields, error) => {
    expect(() =>
      parseImageSubtitleArrangement(json([{ image: 'picture.png', ...fields }])),
    ).toThrow(error);
  });

  it('rejects overlapping explicit intervals', () => {
    expect(() =>
      parseImageSubtitleArrangement(
        json([
          { image: 'one.png', startTime: 0, endTime: 4, content: '第一句' },
          { image: 'two.png', startTime: 3, endTime: 5, content: '第二句' },
        ]),
      ),
    ).toThrow('時間範圍重疊');
  });

  it('fills legacy image gaps while preserving absolute SRT times and caption gaps', () => {
    const result = parseImageSubtitleArrangement(
      json([
        { image: 'later.png', srt: later },
        { image: 'first.png', srt: first },
      ]),
    );
    expect(result.scenes.map(({ image, start, duration }) => ({ image, start, duration }))).toEqual(
      [
        { image: 'first.png', start: 0, duration: 6 },
        { image: 'later.png', start: 6, duration: 2 },
      ],
    );
    expect(
      parseSubtitles(result.subtitles).map(({ time, endTime, text }) => ({ time, endTime, text })),
    ).toEqual([
      { time: 1, endTime: 3, text: '第一句' },
      { time: 4, endTime: 5, text: '第二句' },
      { time: 6, endTime: 8, text: '第三句' },
    ]);
  });

  it('accepts BOM, CRLF and multiline SRT without losing translations', () => {
    const result = parseImageSubtitleArrangement(
      '\uFEFF' +
        json([
          {
            image: 'picture.png',
            srt: '\uFEFF1\r\n00:00:01,000 --> 00:00:01,050\r\n歌詞\r\nTranslation',
          },
        ]),
    );
    expect(result.scenes[0].duration).toBe(1.05);
    expect(parseSubtitles(result.subtitles)[0]).toMatchObject({
      text: '歌詞',
      subText: 'Translation',
    });
  });

  it('aligns lyric-anchored images continuously through the end of the song', () => {
    const result = parseImageSubtitleArrangement(
      json([
        { name: '最後.png', startTime: 10, endTime: 12, content: '有人問我，為何而戰' },
        { name: '第一.png', startTime: 2, endTime: 4, content: '北風掠過殘破城牆' },
        { name: '第二.png', startTime: 6, endTime: 8, content: '烽火染紅半壁山河' },
      ]),
      15,
    );
    expect(result.scenes.map(({ name, start, duration }) => ({ name, start, duration }))).toEqual([
      { name: '第一.png', start: 0, duration: 6 },
      { name: '第二.png', start: 6, duration: 4 },
      { name: '最後.png', start: 10, duration: 5 },
    ]);
    expect(parseSubtitles(result.subtitles).map(({ time, endTime }) => [time, endTime])).toEqual([
      [2, 4],
      [6, 8],
      [10, 12],
    ]);
  });

  it.each([
    [0, 8.003],
    [4, 8.003],
    [12, 12],
    [12.0001, 12.001],
  ])('covers the entire work with one image when audio duration is %s', (audioDuration, end) => {
    const result = parseImageSubtitleArrangement(
      json([{ name: '唯一.png', startTime: 2, endTime: 8.003, content: '歌詞' }]),
      audioDuration,
    );
    expect(result.scenes[0]).toMatchObject({ start: 0, duration: end });
    expect(parseSubtitles(result.subtitles)[0]).toMatchObject({ time: 2, endTime: 8.003 });
  });

  it.each([
    ['invalid JSON', '{', 'JSON 格式'],
    ['unsupported version', JSON.stringify({ version: 2, scenes: [] }), 'version'],
    ['empty arrangement', json([]), 'scenes'],
    ['missing image reference', json([{ srt: first }]), 'name'],
    ['empty name', json([{ name: '  ', srt: first }]), 'name'],
    ['nontext name', json([{ name: 123, srt: first }]), 'name'],
    ['null name', json([{ name: null, srt: first }]), 'name'],
    ['URL as name', json([{ name: 'https://example.com/picture.png', srt: first }]), '不支援網址'],
    ['path as name', json([{ name: '/Users/example/picture.png', srt: first }]), '本機路徑'],
    ['data URL as name', json([{ name: 'data:image/png;base64,YQ==', srt: first }]), '圖片檔名'],
    ['empty legacy image', json([{ image: '', name: 'picture.png', srt: first }]), 'image'],
    ['null legacy image', json([{ image: null, name: 'picture.png', srt: first }]), 'image'],
    [
      'external URL',
      json([{ image: 'https://example.com/picture.png', srt: first }]),
      '不支援網址',
    ],
    ['local path', json([{ image: '/Users/example/picture.png', srt: first }]), '本機路徑'],
    ['invalid base64', json([{ image: 'data:image/png;base64,???', srt: first }]), 'Base64'],
    [
      'unsupported image',
      json([{ image: 'data:image/svg+xml;base64,YQ==', srt: first }]),
      'Base64',
    ],
    ['untimed lyrics', json([{ image: 'picture.png', srt: 'plain lyrics' }]), 'SRT 格式'],
    [
      'bad minutes',
      json([{ image: 'picture.png', srt: '1\n00:60:00,000 --> 00:61:00,000\n歌詞' }]),
      'SRT 格式',
    ],
    [
      'reversed time',
      json([{ image: 'picture.png', srt: '1\n00:00:03,000 --> 00:00:01,000\n歌詞' }]),
      '結束時間',
    ],
    [
      'partially invalid SRT',
      json([{ image: 'picture.png', srt: first + '\n\nbroken block' }]),
      'SRT 格式',
    ],
    [
      'overlapping cues',
      json([{ image: 'picture.png', srt: first + '\n\n3\n00:00:02,000 --> 00:00:04,000\n重疊' }]),
      '時間重疊',
    ],
    [
      'overlapping scenes',
      json([
        { image: 'one.png', srt: first },
        { image: 'two.png', srt: first },
      ]),
      '時間範圍重疊',
    ],
  ])('rejects %s instead of silently dropping data', (_name, input, error) => {
    expect(() => parseImageSubtitleArrangement(input)).toThrow(error);
  });

  it('keeps legacy image sources when a display name is also provided', () => {
    const result = parseImageSubtitleArrangement(
      json([{ image: 'picture.png', name: '自訂名稱', srt: first }]),
    );
    expect(result.scenes[0]).toMatchObject({ image: 'picture.png', name: '自訂名稱' });
  });

  it('continues to decode legacy embedded images', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    const result = parseImageSubtitleArrangement(json([{ image, srt: first }]));
    expect(result.scenes[0]).toMatchObject({ image, name: '圖片-1.png' });
    const file = embeddedImageFile(image, result.scenes[0].name);
    expect(file.name).toBe('圖片-1.png');
    expect(file.type).toBe('image/png');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
  });

  it('ships an example with filenames only and five cues over twelve seconds', () => {
    const text = readFileSync(
      new URL('../../public/examples/image-subtitles.json', import.meta.url),
      'utf8',
    );
    const example = JSON.parse(text);
    for (const scene of example.scenes) expect(scene).not.toHaveProperty('image');
    const result = parseImageSubtitleArrangement(text);
    expect(result.cueCount).toBe(5);
    expect(result.scenes.map(({ start, duration }) => [start, duration])).toEqual([
      [0, 2],
      [2, 2],
      [4, 4],
      [8, 2],
      [10, 2],
    ]);
    expect(result.scenes.map(({ image }) => image)).toEqual([
      '清晨.png',
      '清晨.png',
      '海岸.png',
      '夜色.png',
      '夜色.png',
    ]);
  });
});
