import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
function audioFixture() {
  const buffer = Buffer.alloc(44 + 16000 * 2 * 5);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(buffer.length - 44, 40);
  for (let index = 0; index < 80000; index++)
    buffer.writeInt16LE(
      Math.round(Math.sin((index / 16000) * Math.PI * 440) * 8000),
      44 + index * 2,
    );
  return { name: 'roundtrip.wav', mimeType: 'audio/wav', buffer };
}
async function hover(page: Page) {
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
}
async function imageFixture(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#248f9c';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL().split(',')[1];
  });
  return { name: 'art.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
test('portable project restores audio, image, logo, lyrics and export choices; corrupt import preserves work', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await hover(page);
  await page.locator('input[aria-label="匯入音訊"]').setInputFiles(audioFixture());
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.locator('input[aria-label="匯入圖片／影片"]').setInputFiles(await imageFixture(page));
  await expect(page.locator('.media-status')).toContainText('2 個素材');
  await page.locator('input[aria-label="匯入Logo"]').setInputFiles(await imageFixture(page));
  await page.locator('input[aria-label="匯入字幕"]').setInputFiles({
    name: 'song.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:00,000 --> 00:00:04,000\n可攜式專案\n'),
  });
  await page.getByLabel('歌曲名稱', { exact: true }).fill('可攜式作品');
  await page.getByText('匯出設定', { exact: true }).click();
  await page.getByLabel('匯出畫質').selectOption('4');
  await page.getByLabel('匯出幀率').selectOption('30');
  await page.getByLabel('匯出解析度').selectOption('720');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存專案', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('可攜式作品.resonance');
  const buffer = await fs.readFile((await download.path())!);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('修改後');
  await page.locator('input[aria-label="開啟專案"]').setInputFiles({
    name: 'broken.resonance',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('broken'),
  });
  await expect(page.getByRole('alert')).toContainText('無法開啟專案');
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('修改後');
  const damagedMedia = Buffer.from(buffer);
  const prefixLength = Buffer.byteLength('RESONANCE1\n');
  const headerLength = damagedMedia.readUInt32BE(prefixLength);
  const mediaOffset = prefixLength + 4 + headerLength;
  const header = JSON.parse(damagedMedia.subarray(prefixLength + 4, mediaOffset).toString()) as {
    files: { size: number }[];
  };
  damagedMedia.fill(0, mediaOffset, mediaOffset + header.files[0].size);
  await page.locator('input[aria-label="開啟專案"]').setInputFiles({
    name: 'damaged-media.resonance',
    mimeType: 'application/octet-stream',
    buffer: damagedMedia,
  });
  await expect(page.locator('.project-loading')).toHaveCount(0);
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('修改後');
  await expect(page.locator('.media-status')).toContainText('2 個素材 · 1 個片段');
  await page.reload();
  await hover(page);
  await page
    .locator('input[aria-label="開啟專案"]')
    .setInputFiles({ name: 'project.resonance', mimeType: 'application/octet-stream', buffer });
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('可攜式作品');
  await expect(page.locator('.media-status')).toContainText('2 個素材 · 1 個片段');
  await expect(page.getByRole('button', { name: '清除Logo', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.getByText('匯出設定', { exact: true }).click();
  await expect(page.getByLabel('匯出畫質')).toHaveValue('4');
  await expect(page.getByLabel('匯出幀率')).toHaveValue('30');
  await expect(page.getByLabel('匯出解析度')).toHaveValue('720');
  await expect(page.getByLabel('MV 即時預覽')).toHaveAttribute('width', '1920');
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('可攜式專案');
  expect(errors).toEqual([]);
});
test('style apply and undo preserve content; custom styles survive reload', async ({ page }) => {
  await page.goto('/');
  await hover(page);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('保留歌名');
  await page.getByText('風格預設', { exact: true }).click();
  await page.getByLabel('選擇風格').selectOption('electronic');
  await page.getByRole('button', { name: '套用風格', exact: true }).click();
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('保留歌名');
  await expect(page.getByLabel('頻譜樣式', { exact: true })).toHaveValue('radial');
  await page.getByRole('button', { name: '復原風格', exact: true }).click();
  await expect(page.getByLabel('頻譜樣式', { exact: true })).toHaveValue('none');
  await page.getByLabel('收藏名稱').fill('我的風格');
  await page.getByRole('button', { name: '收藏目前風格', exact: true }).click();
  await expect(page.getByLabel('選擇風格').locator('option')).toHaveCount(4);
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  await page.reload();
  await hover(page);
  await expect(page.getByRole('button', { name: '恢復草稿', exact: true })).toBeVisible();
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('');
  await page.getByText('風格預設', { exact: true }).click();
  await expect(page.getByLabel('選擇風格').locator('option')).toHaveCount(4);
  await page.locator('.panel-heading').hover();
  await expect(page.locator('.workspace-controls')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/project-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/project-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
for (const storage of ['file', 'memory'] as const) {
  test(`${storage} export produces requested dimensions and ends at the selected range`, async ({
    page,
  }) => {
    await page.addInitScript((storage) => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value:
          storage === 'memory'
            ? undefined
            : async () => {
                // Replace only the native dialog; use a real browser-backed writable file.
                const root = await navigator.storage.getDirectory();
                return root.getFileHandle('recording-test-output', { create: true });
              },
      });
    }, storage);
    await page.goto('/');
    await hover(page);
    await page.locator('input[aria-label="匯入音訊"]').setInputFiles(audioFixture());
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
    await page.getByText('匯出設定', { exact: true }).click();
    await page.getByLabel('匯出解析度').selectOption('720');
    await page.getByLabel('匯出幀率').selectOption('30');
    await page.getByLabel('匯出畫質').selectOption('4');
    await page.getByLabel('匯出範圍').selectOption('custom');
    await page.getByLabel('匯出開始秒數').fill('1');
    await page.getByLabel('匯出結束秒數').fill('3');
    const downloadPromise = storage === 'memory' ? page.waitForEvent('download') : null;
    await page.getByRole('button', { name: '開始錄影', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止錄影並匯出', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始錄影', exact: true })).toBeEnabled();
    const download = await downloadPromise;
    const data = download
      ? await fs.readFile((await download.path())!)
      : Buffer.from(
          await page.evaluate(async () => {
            const root = await navigator.storage.getDirectory();
            const handle = await root.getFileHandle('recording-test-output');
            const bytes = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
            await root.removeEntry('recording-test-output');
            return bytes;
          }),
        );
    expect(data.length).toBeGreaterThan(1000);
    const result = await page.evaluate(async (base64) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(base64), (value) => value.charCodeAt(0))]),
      );
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('invalid video'));
          video.src = url;
        });
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      } finally {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    }, data.toString('base64'));
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    if (Number.isFinite(result.duration)) {
      expect(result.duration).toBeGreaterThan(1);
      expect(result.duration).toBeLessThan(3.5);
    }
    await expect(page.getByRole('button', { name: '開始錄影', exact: true })).toBeEnabled();
  });
}
