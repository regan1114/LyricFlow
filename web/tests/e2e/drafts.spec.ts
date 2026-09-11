import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { draftSnapshot, populateDraft } from './draftHelpers';

test('autosave restores media and subtitles while edits reuse stored media', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const state = window as unknown as { mediaWrites: number };
    state.mediaWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'media') state.mediaWrites++;
      return put.call(this, value, key!);
    };
  });
  await populateDraft(page);
  const before = await draftSnapshot(page);
  expect(before.files).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as unknown as { mediaWrites: number }).mediaWrites),
  ).toBe(1);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('續作測試');
  if (
    (await page
      .getByRole('button', { name: '歌詞編輯', exact: true })
      .getAttribute('aria-pressed')) === 'false'
  )
    await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await page.getByLabel('字幕 1 文字', { exact: true }).fill('修改後的歌詞');
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  const after = await draftSnapshot(page);
  expect(after.draft?.manifest.lyrics).toContain('修改後的歌詞');
  expect(after.files).toEqual(before.files);
  expect(
    await page.evaluate(() => (window as unknown as { mediaWrites: number }).mediaWrites),
  ).toBe(1);
  await page.reload();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('續作測試');
  await expect(page.locator('.media-status')).toContainText('1 個素材');
  if (
    (await page
      .getByRole('button', { name: '歌詞編輯', exact: true })
      .getAttribute('aria-pressed')) === 'false'
  )
    await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('修改後的歌詞');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByLabel('歌曲名稱', { exact: true }).fill('再次編輯');
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  expect(
    await page.evaluate(() => (window as unknown as { mediaWrites: number }).mediaWrites),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('pause persists, manual save works, and deleting keeps current work without immediately resaving', async ({
  page,
}) => {
  await populateDraft(page);
  await page.getByLabel('自動儲存草稿', { exact: true }).uncheck();
  const before = await draftSnapshot(page);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('暫停中');
  await page.waitForTimeout(1200);
  expect(await draftSnapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '立即儲存草稿', exact: true }).click();
  await expect
    .poll(async () => (await draftSnapshot(page)).draft?.manifest.settings.songName)
    .toBe('暫停中');
  await page.reload();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.getByLabel('自動儲存草稿', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
  await page.getByLabel('自動儲存草稿', { exact: true }).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '刪除草稿', exact: true }).click();
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await page.waitForTimeout(1200);
  expect(await draftSnapshot(page)).toEqual({ draft: undefined, files: [] });
  await expect(page.getByLabel('歌曲名稱', { exact: true })).toHaveValue('暫停中');
  await expect(page.locator('.media-status')).toContainText('1 個素材');
});

test('failed storage transaction retains the previous draft and retry succeeds', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'drafts' && (window as unknown as { failDraft?: boolean }).failDraft)
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.call(this, value, key!);
    };
  });
  await populateDraft(page);
  const before = await draftSnapshot(page);
  await page.evaluate(() => {
    (window as unknown as { failDraft: boolean }).failDraft = true;
  });
  await page.getByLabel('歌曲名稱', { exact: true }).fill('空間不足時的編輯');
  await expect(page.locator('.draft-status')).toContainText('瀏覽器空間不足');
  expect(await draftSnapshot(page)).toEqual(before);
  await page.evaluate(() => {
    (window as unknown as { failDraft: boolean }).failDraft = false;
  });
  await page.getByRole('button', { name: '重試儲存草稿', exact: true }).click();
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  expect((await draftSnapshot(page)).draft?.manifest.settings.songName).toBe('空間不足時的編輯');
});

test('stale tabs cannot overwrite or resurrect drafts without an explicit choice', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  const second = await context.newPage();
  await second.goto('/');
  await second.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await expect(second.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await page.getByLabel('歌曲名稱', { exact: true }).fill('分頁一');
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  await second.getByLabel('歌曲名稱', { exact: true }).fill('分頁二');
  await expect(second.locator('.draft-status')).toContainText('其他分頁');
  expect((await draftSnapshot(page)).draft?.manifest.settings.songName).toBe('分頁一');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '刪除草稿', exact: true }).click();
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  second.once('dialog', (dialog) => dialog.accept());
  await second.getByRole('button', { name: '恢復草稿', exact: true }).click();
  await expect(second.getByRole('button', { name: '恢復草稿', exact: true })).toHaveCount(0);
  expect(await draftSnapshot(page)).toEqual({ draft: undefined, files: [] });
  await second.getByRole('button', { name: '以目前作品取代', exact: true }).click();
  await expect(second.locator('.draft-status')).toHaveText('草稿已儲存');
  expect((await draftSnapshot(page)).draft?.manifest.settings.songName).toBe('分頁二');
  await second.close();
});

test('legacy packed drafts remain recoverable after database upgrade', async ({ page }) => {
  await populateDraft(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '儲存專案', exact: true }).click();
  const buffer = await fs.readFile((await (await downloading).path())!);
  await page.evaluate(async (base64) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('resonance-projects');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('resonance-projects', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(
        {
          savedAt: Date.now(),
          blob: new Blob([Uint8Array.from(atob(base64), (value) => value.charCodeAt(0))]),
        },
        'current',
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, buffer.toString('base64'));
  await page.reload();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.locator('.draft-details')).toContainText('舊版草稿');
  await page.getByRole('button', { name: '恢復草稿', exact: true }).click();
  await expect(page.locator('.media-status')).toContainText('1 個素材');
  await page.getByLabel('歌曲名稱', { exact: true }).fill('已轉新版');
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
  expect((await draftSnapshot(page)).files).toHaveLength(1);
});

test('recognition and reset show icons with hover and keyboard labels', async ({ page }) => {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  for (const label of ['自動辨識', '重置']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button.locator('svg')).toHaveCount(1);
    await expect(button.locator('.button-tooltip')).not.toBeVisible();
    await button.hover();
    await expect(button.locator('.button-tooltip')).toBeVisible();
    await expect(button.locator('.button-tooltip')).toHaveText(label);
    await expect(page.locator('.workspace-controls')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/icon-${label}.png` });
    await page.locator('.panel-heading').hover();
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button.locator('.button-tooltip')).toBeVisible();
    await button.evaluate((element) => (element as HTMLButtonElement).blur());
  }
  await page.locator('.draft-panel').scrollIntoViewIfNeeded();
  await page.locator('.panel-heading').hover();
  await expect(page.locator('.workspace-controls')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/draft-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.draft-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/draft-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('a pending first save cannot recreate a draft after another empty tab resets', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  const second = await context.newPage();
  await second.goto('/');
  await second.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await expect(second.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await second.getByLabel('自動儲存草稿', { exact: true }).uncheck();
  await second.getByLabel('歌曲名稱', { exact: true }).fill('舊分頁未保存');
  page.once('dialog', (dialog) => dialog.accept());
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: '重置', exact: true }).click(),
  ]);
  await second.getByRole('button', { name: '立即儲存草稿', exact: true }).click();
  await expect(second.locator('.draft-status')).toContainText('其他分頁');
  expect(await draftSnapshot(page)).toEqual({ draft: undefined, files: [] });
  await second.close();
});
