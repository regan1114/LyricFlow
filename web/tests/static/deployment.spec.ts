import { expect, test } from '@playwright/test';
import { populateDraft } from '../e2e/draftHelpers';

function audioFixture() {
  const buffer = Buffer.alloc(44 + 16000 * 2 * 4);
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
  return { name: 'browser-only.wav', mimeType: 'audio/wav', buffer };
}

test('static build edits and restores projects without a recognition service', async ({ page }) => {
  const apiRequests: string[] = [],
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => {
    apiRequests.push(route.request().url());
    return route.abort();
  });
  await populateDraft(page);
  await expect(page.getByRole('button', { name: '自動辨識', exact: true })).toHaveCount(0);
  await expect(page.locator('.recognition-dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeVisible();
  await page.getByLabel('匯入音訊', { exact: true }).setInputFiles(audioFixture());
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.getByLabel('歌曲名稱', { exact: true }).fill('純前端作品');
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await page.getByLabel('字幕 1 文字', { exact: true }).fill('瀏覽器內編輯');
  await page.getByRole('button', { name: '開始對時', exact: true }).click();
  await expect(page.getByRole('heading', { name: '歌詞對時', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('瀏覽器內編輯');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SRT', exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.srt$/);
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  await page.reload();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('純前端作品');
  await expect(page.locator('.media-status')).toContainText('2 個素材');
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '自動辨識', exact: true })).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
