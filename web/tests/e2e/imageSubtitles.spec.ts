import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import type { ProjectManifest } from '../../src/domain/project';
import { parseSubtitles } from '../../src/domain/subtitles';

const timedContent = (startTime: number, endTime: number, content: string) => ({
  startTime,
  endTime,
  content,
});

async function showControls(page: Page) {
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
}
async function openImporter(page: Page) {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await showControls(page);
}
async function upload(page: Page, scenes: unknown[]) {
  await page.getByLabel('匯入圖片字幕 JSON', { exact: true }).setInputFiles({
    name: 'arrangement.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, scenes })),
  });
}
async function uploadAudio(page: Page) {
  const audio = Buffer.alloc(44 + 16000 * 2 * 10);
  audio.write('RIFF');
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(16000, 24);
  audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(audio.length - 44, 40);
  await page
    .getByLabel('加入音訊素材', { exact: true })
    .setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer: audio });
  await expect(page.locator('.media-clip')).toHaveCount(1);
}
async function pictures(page: Page) {
  return page.evaluate(() =>
    ['#ff0000', '#0000ff'].map((color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 9;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 16, 9);
      return canvas.toDataURL();
    }),
  );
}
async function color(page: Page) {
  return page.getByLabel('MV 即時預覽').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixel = canvas
      .getContext('2d')!
      .getImageData(canvas.width * 0.5, canvas.height * 0.2, 1, 1).data;
    return pixel[0] > pixel[2] * 2 ? 'red' : pixel[2] > pixel[0] * 2 ? 'blue' : 'other';
  });
}
async function saveProject(page: Page) {
  await showControls(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存專案', exact: true }).click();
  const download = await downloading;
  const bytes = await fs.readFile((await download.path())!);
  const prefix = Buffer.from('RESONANCE1\n');
  expect(bytes.subarray(0, prefix.length)).toEqual(prefix);
  const size = bytes.readUInt32BE(prefix.length);
  const start = prefix.length + 4;
  const data = JSON.parse(bytes.subarray(start, start + size).toString()) as {
    manifest: ProjectManifest;
  };
  return { bytes, data };
}

test('downloaded example matches uploaded images by name and survives project save and reopen', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openImporter(page);
  const [red] = await pictures(page);
  await page.getByLabel('加入圖片／影片素材', { exact: true }).setInputFiles(
    ['夜色.png', '清晨.png', '海岸.png'].map((name) => ({
      name,
      mimeType: 'image/png',
      buffer: Buffer.from(red.split(',')[1], 'base64'),
    })),
  );
  await expect(page.locator('.library-asset')).toHaveCount(3);
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: '下載 JSON 範例', exact: true }).click();
  const example = await downloading;
  expect(example.suggestedFilename()).toBe('image-subtitles.json');
  await page.getByLabel('匯入圖片字幕 JSON', { exact: true }).setInputFiles({
    name: example.suggestedFilename(),
    mimeType: 'application/json',
    buffer: await fs.readFile((await example.path())!),
  });
  await expect(page.locator('.image-subtitle-import [role=status]')).toContainText(
    '5 個圖片片段、5 句字幕',
  );
  await expect(page.locator('.media-clip')).toHaveCount(5);
  await expect(page.getByLabel('時間軸播放位置')).toHaveAttribute('max', '12');
  await expect(page.getByRole('button', { name: '手動時間軸', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const { bytes, data } = await saveProject(page);
  expect(data.manifest.assets).toHaveLength(3);
  expect(
    data.manifest.clips.map(
      (clip) => data.manifest.assets.find((asset) => asset.id === clip.assetId)?.name,
    ),
  ).toEqual(['清晨.png', '清晨.png', '海岸.png', '夜色.png', '夜色.png']);
  expect(data.manifest.clips.map(({ start, duration }) => [start, duration])).toEqual([
    [0, 2],
    [2, 2],
    [4, 4],
    [8, 2],
    [10, 2],
  ]);
  await page.reload();
  await page.getByLabel('開啟專案', { exact: true }).setInputFiles({
    name: 'arrangement.resonance',
    mimeType: 'application/octet-stream',
    buffer: bytes,
  });
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.locator('.project-tools')).toContainText('專案已開啟');
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.locator('.media-clip')).toHaveCount(5);
  await expect(page.locator('.caption-row')).toHaveCount(5);
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('晨光輕輕落在窗前');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.screenshot({ path: 'test-results/image-subtitles-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.image-subtitle-import').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/image-subtitles-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

for (const source of ['name', 'embedded'] as const) {
  test(`${source} images fill intro, lyric gaps and outro while following lyric start boundaries`, async ({
    page,
  }) => {
    await openImporter(page);
    for (const name of ['懷舊濾鏡', '散景', '暗角'])
      await page.getByRole('checkbox', { name, exact: true }).uncheck();
    await uploadAudio(page);
    const [red, blue] = await pictures(page);
    if (source === 'name') {
      await page.getByLabel('加入圖片／影片素材', { exact: true }).setInputFiles([
        {
          name: 'blue.png',
          mimeType: 'image/png',
          buffer: Buffer.from(blue.split(',')[1], 'base64'),
        },
        {
          name: 'red.png',
          mimeType: 'image/png',
          buffer: Buffer.from(red.split(',')[1], 'base64'),
        },
      ]);
      await expect(page.locator('.library-asset')).toHaveCount(3);
    }
    await upload(page, [
      {
        ...(source === 'embedded' ? { image: red } : {}),
        name: 'red.png',
        ...timedContent(1, 2, '紅色歌詞'),
      },
      {
        ...(source === 'embedded' ? { image: blue } : {}),
        name: 'blue.png',
        ...timedContent(4, 6, '藍色歌詞'),
      },
    ]);
    await expect(page.locator('.media-clip')).toHaveCount(3);
    const { bytes, data } = await saveProject(page);
    expect(
      data.manifest.clips
        .filter((clip) => clip.track === 'V1')
        .map(({ start, duration }) => [start, duration]),
    ).toEqual([
      [0, 4],
      [4, 6],
    ]);
    expect(
      parseSubtitles(data.manifest.lyrics).map(({ time, endTime }) => [time, endTime]),
    ).toEqual([
      [1, 2],
      [4, 6],
    ]);
    await expect.poll(() => color(page)).toBe('red');
    await page.getByLabel('時間軸播放位置').fill('4');
    await expect.poll(() => color(page)).toBe('blue');
    await page.getByLabel('時間軸播放位置').fill('3.7');
    await expect.poll(() => color(page)).toBe('red');
    await showControls(page);
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect.poll(() => color(page)).toBe('blue');
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    const paused = await page.getByLabel('時間軸播放位置').inputValue();
    await page.waitForTimeout(500);
    await expect(page.getByLabel('時間軸播放位置')).toHaveValue(paused);
    await page.getByLabel('時間軸播放位置').fill('0');
    await expect.poll(() => color(page)).toBe('red');
    for (const time of ['6', '9.9', '10']) {
      await page.getByLabel('時間軸播放位置').fill(time);
      await expect.poll(() => color(page)).toBe('blue');
    }
    await page.reload();
    await page.getByLabel('開啟專案', { exact: true }).setInputFiles({
      name: 'aligned.resonance',
      mimeType: 'application/octet-stream',
      buffer: bytes,
    });
    await expect(page.locator('.project-tools')).toContainText('專案已開啟');
    await showControls(page);
    await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
    await page.getByLabel('時間軸播放位置').fill('9.9');
    await expect.poll(() => color(page)).toBe('blue');
  });
}

test('uses existing filenames, preserves audio and settings, and rolls back a broken image', async ({
  page,
}) => {
  await openImporter(page);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('保留歌曲');
  await uploadAudio(page);
  const [red, blue] = await pictures(page);
  await page.getByLabel('加入圖片／影片素材', { exact: true }).setInputFiles({
    name: 'existing.png',
    mimeType: 'image/png',
    buffer: Buffer.from(red.split(',')[1], 'base64'),
  });
  await expect(page.locator('.library-asset')).toHaveCount(2);
  await page.getByRole('button', { name: '手動時間軸', exact: true }).click();
  await page.getByRole('button', { name: '加入時間軸：existing.png', exact: true }).click();
  await page.getByLabel('影音片段長度', { exact: true }).fill('30');
  await page.getByLabel('影音片段長度', { exact: true }).press('Tab');
  await expect(page.getByLabel('時間軸播放位置')).toHaveAttribute('max', '30');
  await upload(page, [{ image: 'existing.png', ...timedContent(1, 6, '對應既有圖片') }]);
  await expect(page.locator('.image-subtitle-import [role=status]')).toContainText(
    '1 個圖片片段、1 句字幕',
  );
  const before = (await saveProject(page)).data.manifest;
  expect(before.settings.songName).toBe('保留歌曲');
  expect(before.assets).toHaveLength(2);
  expect(before.clips.map(({ track, start, duration }) => ({ track, start, duration }))).toEqual([
    { track: 'A1', start: 0, duration: 10 },
    { track: 'V1', start: 0, duration: 10 },
  ]);
  for (const scenes of [
    [{ name: 'missing.png', ...timedContent(0, 2, '不存在') }],
    [{ name: 'Existing.png', ...timedContent(0, 2, '大小寫不同') }],
    [{ name: 'song.wav', ...timedContent(0, 2, '不是圖片') }],
    [
      { image: blue, ...timedContent(0, 2, '有效') },
      { image: 'data:image/png;base64,YmFk', ...timedContent(2, 4, '壞圖') },
    ],
    [
      { image: red, ...timedContent(0, 4, '重疊') },
      { image: blue, ...timedContent(2, 6, '重疊') },
    ],
    [{ image: red, startTime: 0, endTime: '4', content: '時間格式錯誤' }],
    [{ image: red, startTime: 0, endTime: 4, content: '' }],
  ]) {
    await upload(page, scenes);
    await expect(page.getByRole('alert')).toContainText('目前作品已保留');
    expect((await saveProject(page)).data.manifest).toEqual(before);
    await page.getByRole('button', { name: '關閉錯誤訊息', exact: true }).click();
  }
  await page.getByLabel('加入圖片／影片素材', { exact: true }).setInputFiles({
    name: 'existing.png',
    mimeType: 'image/png',
    buffer: Buffer.from(blue.split(',')[1], 'base64'),
  });
  await expect(page.locator('.library-asset')).toHaveCount(3);
  const withDuplicate = (await saveProject(page)).data.manifest;
  await upload(page, [{ name: 'existing.png', ...timedContent(0, 2, '同名圖片') }]);
  await expect(page.getByRole('alert')).toContainText('多張同名圖片「existing.png」');
  expect((await saveProject(page)).data.manifest).toEqual(withDuplicate);
});
