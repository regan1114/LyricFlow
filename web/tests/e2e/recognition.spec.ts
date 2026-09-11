import { expect, test, type Page } from '@playwright/test';

const original = '1\n00:00:00,000 --> 00:00:01,000\n原有字幕\n';
const recognized = '1\n00:00:01,000 --> 00:00:02,000\n新的歌詞\n';

async function song(page: Page) {
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
  await page
    .getByLabel('匯入音訊', { exact: true })
    .setInputFiles({ name: 'song.wav', mimeType: 'audio/wav', buffer });
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
}
async function open(page: Page, subtitles = false) {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await song(page);
  if (subtitles)
    await page
      .getByLabel('匯入字幕', { exact: true })
      .setInputFiles({ name: 'old.srt', mimeType: 'text/plain', buffer: Buffer.from(original) });
  await page.getByRole('button', { name: '自動辨識', exact: true }).click();
  await page.getByRole('textbox', { name: '歌詞', exact: true }).fill('新的歌詞');
}
async function mock(page: Page, status = 'done') {
  const calls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(path);
    if (path === '/api/health') return route.fulfill({ json: { ready: true } });
    if (path === '/api/jobs') {
      expect(request.postDataJSON()).toMatchObject({ name: 'song.wav', lyrics: '新的歌詞' });
      return route.fulfill({ status: 201, json: { id: 'test-job' } });
    }
    if (path.endsWith('/srt')) return route.fulfill({ body: recognized });
    if (path.endsWith('/cancel')) return route.fulfill({ json: { status: 'cancelled' } });
    if (path.endsWith('/audio')) {
      expect(request.postDataBuffer()?.subarray(0, 4).toString()).toBe('RIFF');
      return route.fulfill({ status: 202, json: {} });
    }
    return route.fulfill({
      json: {
        status,
        message: status === 'error' ? '測試辨識失敗' : '正在辨識…',
        progress: { percent: 40 },
        result: { unmatched_count: 0, review_count: 1 },
      },
    });
  });
  return calls;
}

test('requires a song before opening the lyrics dialog', async ({ page }) => {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: '自動辨識', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('請先匯入歌曲');
  await expect(page.getByRole('dialog', { name: '自動辨識', exact: true })).toBeHidden();
});

test('cancel replacement pauses submission and preserves lyrics; confirmation applies results', async ({
  page,
}) => {
  const calls = await mock(page);
  await open(page, true);
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('會刪除原有的字幕');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
  expect(calls).toEqual([]);
  await expect(page.getByRole('textbox', { name: '歌詞', exact: true })).toHaveValue('新的歌詞');
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await page.getByRole('button', { name: '確認取代並辨識' }).click();
  await expect(page.getByRole('status').filter({ hasText: '辨識完成' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('新的歌詞');
});

test('without subtitles submits directly and shows progress; cancellation preserves content', async ({
  page,
}) => {
  const calls = await mock(page, 'processing');
  await open(page);
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '40');
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.getByRole('button', { name: '取消辨識', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已取消辨識' })).toBeVisible();
  expect(calls).toContain('/api/jobs/test-job/cancel');
});

test('backend errors preserve existing subtitles', async ({ page }) => {
  await mock(page, 'error');
  await open(page, true);
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await page.getByRole('button', { name: '確認取代並辨識' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('測試辨識失敗');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('原有字幕');
});

test('recognition dialog fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const dialog = page.getByRole('dialog', { name: '自動辨識', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/recognition-mobile.png', fullPage: true });
});

test('reimported lyrics replace the previous recognition input and are sent in a fresh job', async ({
  page,
}) => {
  await mock(page);
  const submitted: string[] = [];
  await page.route('**/api/jobs', (route) => {
    submitted.push(route.request().postDataJSON().lyrics);
    return route.fulfill({ status: 201, json: { id: `job-${submitted.length}` } });
  });
  await page.route('**/api/jobs/*/srt', (route) =>
    route.fulfill({
      body: `1\n00:00:01,000 --> 00:00:02,000\n${submitted.at(-1)}\n`,
    }),
  );
  await open(page, true);
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await page.getByRole('button', { name: '確認取代並辨識' }).click();
  await expect(page.getByRole('status').filter({ hasText: '辨識完成' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByLabel('匯入字幕', { exact: true }).setInputFiles({
    name: 'updated.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('重新上傳的第二版歌詞'),
  });
  await page.getByRole('button', { name: '自動辨識', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '歌詞', exact: true })).toHaveValue(
    '重新上傳的第二版歌詞',
  );
  await page.getByRole('button', { name: '送出', exact: true }).click();
  await page.getByRole('button', { name: '確認取代並辨識' }).click();
  await expect(page.getByRole('status').filter({ hasText: '辨識完成' })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  expect(submitted).toEqual(['新的歌詞', '重新上傳的第二版歌詞']);
  await expect(page.getByLabel('字幕 1 文字', { exact: true })).toHaveValue('重新上傳的第二版歌詞');
});

test('reimporting the same subtitle file also refreshes a previously edited dialog draft', async ({
  page,
}) => {
  await open(page, true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByLabel('匯入字幕', { exact: true }).setInputFiles({
    name: 'old.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await page.getByRole('button', { name: '自動辨識', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '歌詞', exact: true })).toHaveValue('原有字幕');
});
