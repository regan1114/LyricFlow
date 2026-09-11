import { expect, type Page } from '@playwright/test';

export async function draftSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('resonance-projects', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(['drafts', 'media']);
      const current = transaction.objectStore('drafts').get('current');
      const files = transaction.objectStore('media').getAllKeys();
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      return {
        draft: current.result as
          | { revision: string; manifest: { settings: { songName: string }; lyrics: string } }
          | undefined,
        files: files.result,
      };
    } finally {
      db.close();
    }
  });
}
export async function populateDraft(page: Page) {
  await page.goto('/');
  await expect(page.locator('.draft-status')).toContainText('編輯後會自動儲存');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByLabel('匯入字幕', { exact: true }).setInputFiles({
    name: 'lyrics.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n測試字幕'),
  });
  const buffer = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('匯入圖片／影片', { exact: true }).setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from(buffer, 'base64'),
  });
  await expect(page.locator('.media-status')).toContainText('1 個素材');
  await expect(page.locator('.draft-status')).toHaveText('草稿已儲存');
}
