import { expect, test } from '@playwright/test';
import { draftSnapshot, populateDraft } from './draftHelpers';

test('cancelling reset preserves media and saved draft', async ({ page }) => {
  await populateDraft(page);
  const before = await draftSnapshot(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.locator('.media-status')).toContainText('1 個素材');
  expect(await draftSnapshot(page)).toEqual(before);
});

test('reset removes media, subtitles and pending drafts across reloads', async ({ page }) => {
  await populateDraft(page);
  await page.evaluate(() => {
    localStorage.setItem('lyric-flow:last-job', 'old-job');
    localStorage.setItem('lyric-flow:edits:old-job', 'old-subtitles');
    localStorage.setItem('unrelated-preference', 'keep');
  });
  await page.getByLabel('歌曲名稱', { exact: true }).fill('尚未寫入的變更');
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '重置', exact: true }).click(),
  ]);
  await expect(page.locator('.media-status')).toContainText('0 個素材 · 0 個片段');
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  expect(await draftSnapshot(page)).toEqual({ draft: undefined, files: [] });
  await page.reload();
  await expect(page.locator('.media-status')).toContainText('0 個素材');
  await expect(page.getByRole('button', { name: '恢復草稿', exact: true })).toHaveCount(0);
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.locator('.subtitle-clip')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lyric-flow:last-job'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('lyric-flow:edits:old-job'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep');
});
