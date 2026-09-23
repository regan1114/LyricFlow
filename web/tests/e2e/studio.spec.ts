import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function imageFixture(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d')!;
    for (let x = 0; x < canvas.width; x += 40) {
      context.fillStyle = x % 80 ? '#dce9ec' : '#248f9c';
      context.fillRect(x, 0, 40, canvas.height);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'test-pattern.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function openStudio(page: Page, mode: 'manual' | 'auto' = 'manual') {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(page.getByText('0 個背景')).toBeVisible();
  if (mode === 'manual')
    await page.getByRole('button', { name: '手動時間軸', exact: true }).click();
}

function audioFixture(frequency = 220) {
  const rate = 16000;
  const samples = rate * 18;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++)
    buffer.writeInt16LE(
      Math.round(Math.sin((index / rate) * Math.PI * 2 * frequency) * 8000),
      44 + index * 2,
    );
  return { name: '測試歌曲.wav', mimeType: 'audio/wav', buffer };
}

async function importAudio(page: Page) {
  await page.locator('input[type=file][aria-label="匯入音訊"]').setInputFiles(audioFixture());
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await expect(page.locator('.studio')).not.toHaveClass(/lyrics-editing/);
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
}

test('preview, settings, playback, lyric sync and video export', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openStudio(page);
  await expect(page.getByRole('navigation', { name: '設定分類' })).toHaveCount(0);
  await expect(page.locator('.settings-fields:visible')).toHaveCount(6);
  await expect(page.getByLabel('標題呈現模式', { exact: true })).toHaveValue('classic');
  await expect(page.getByLabel('光核模式', { exact: true })).toHaveValue('none');
  await expect(page.getByLabel('頻譜樣式', { exact: true })).toHaveValue('none');
  await page.getByLabel('光核模式', { exact: true }).selectOption('orb');
  await page.waitForTimeout(600);
  const pixels = await page.getByLabel('MV 即時預覽').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const values = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let pixelIndex = 0; pixelIndex < values.length; pixelIndex += 400)
      if (values[pixelIndex] + values[pixelIndex + 1] + values[pixelIndex + 2] > 60) bright++;
    return bright;
  });
  expect(pixels).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/desktop.png' });
  await page.getByLabel('字型', { exact: true }).selectOption({ label: '內建 - 粉圓 Huninn' });
  await expect(page.locator('.font-preview')).toContainText('粉圓 Huninn');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Signal Huninn"')))
    .toBe(true);
  await page.getByLabel('歌曲名稱', { exact: true }).fill('Vue 測試');
  await page.getByLabel('畫布比例', { exact: true }).selectOption('1:1');
  await expect(page.getByLabel('MV 即時預覽')).toHaveAttribute('height', '1920');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByLabel('畫布比例', { exact: true }).selectOption('16:9');
  await importAudio(page);
  await expect(page.getByRole('region', { name: '影片時間軸' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await page.locator('input[type=file][aria-label="匯入字幕"]').setInputFiles({
    name: 'lyrics.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一句\n第二句'),
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByRole('button', { name: '開始對時', exact: true }).click();
  await page.waitForTimeout(250);
  await page.keyboard.press('Space');
  await expect(page.locator('.sync-lines .stamped')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(page.locator('.workspace-controls')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '復原上一句', exact: true }).click();
  await page.getByRole('button', { name: '標記目前歌詞', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '標記目前歌詞', exact: true }).click();
  await page.getByRole('button', { name: '完成對時', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('第一句');
  const subtitleDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SRT', exact: true }).click();
  expect((await subtitleDownload).suggestedFilename()).toMatch(/\.srt$/);
  await page.getByRole('button', { name: '關閉歌詞編輯', exact: true }).click();
  await page.getByLabel('沉浸場景', { exact: true }).selectOption('forest');
  await expect(page.getByText('1 個背景')).toBeVisible();
  await page.waitForTimeout(700);
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.screenshot({ path: 'test-results/scene-settings-desktop.png' });
  await page.getByRole('button', { name: '開始錄影', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止錄影並匯出' })).toBeVisible();
  await page.waitForTimeout(1400);
  const videoDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '停止錄影並匯出' }).click();
  const video = await videoDownload;
  expect(video.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  await video.saveAs('test-results/' + video.suggestedFilename());
  const bytes = await fs.readFile(await video.path());
  const metadata = await page.evaluate(
    async ({ base64, type }) => {
      const element = document.createElement('video');
      element.muted = true;
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      element.src = url;
      await new Promise((resolve, reject) => {
        element.onloadeddata = resolve;
        element.onerror = reject;
      });
      document.body.append(element);
      const presented = new Promise((resolve) => element.requestVideoFrameCallback(resolve));
      await element.play();
      await presented;
      element.pause();
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0, 64, 36);
      const pixels = context.getImageData(0, 0, 64, 36).data;
      let scenePixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 80) scenePixels++;
      }
      const result = {
        width: element.videoWidth,
        height: element.videoHeight,
        duration: element.duration,
        scenePixels,
      };
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
      element.load();
      element.remove();
      return result;
    },
    {
      base64: bytes.toString('base64'),
      type: video.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    },
  );
  expect(metadata.width).toBe(1920);
  expect(metadata.height).toBe(1080);
  expect(metadata.duration).toBeGreaterThan(0);
  expect(metadata.scenePixels).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('scene controls remain accessible in automatic mode and selecting a scene preserves assets', async ({
  page,
}) => {
  await openStudio(page, 'auto');
  const sceneSelect = page.getByLabel('沉浸場景', { exact: true });
  await expect(sceneSelect).toBeVisible();
  await page.locator('input[aria-label="匯入圖片／影片"]').setInputFiles(await imageFixture(page));
  await expect(page.locator('.library-asset')).toHaveCount(1);
  await sceneSelect.selectOption('kyoto');
  await expect(page.getByRole('button', { name: '手動時間軸', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('庭院雨勢', { exact: true })).toBeVisible();
  await page.getByLabel('庭院雨勢', { exact: true }).fill('70');
  await expect(page.getByText('1 個背景')).toBeVisible();
  await expect(page.locator('.library-asset')).toHaveCount(1);
  await page.getByRole('button', { name: '自動編排圖片', exact: true }).click();
  await expect(sceneSelect).toBeVisible();
  await expect(page.getByLabel('庭院雨勢', { exact: true })).toHaveValue('70');
  await page.getByRole('button', { name: '關閉歌詞編輯', exact: true }).click();
  await page.locator('.scene-panel-heading').hover();
  const scenePanel = page.locator('.right-controls .scene-panel');
  const left = await page.locator('.settings-panel').boundingBox();
  const right = await scenePanel.boundingBox();
  expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
  await page.getByRole('button', { name: '場景設定', exact: true }).click();
  await expect(sceneSelect).toBeHidden();
  await page.getByRole('button', { name: '場景設定', exact: true }).click();
  await expect(page.getByLabel('庭院雨勢', { exact: true })).toHaveValue('70');
  await page.screenshot({ path: 'test-results/scene-panel-right.png' });
});

test('shows independent effect controls for each immersive scene', async ({ page }) => {
  await openStudio(page);
  await page.getByLabel('霧氣 / 極光', { exact: true }).selectOption('fog');
  await page.getByRole('checkbox', { name: '雨絲', exact: true }).check();
  const videoValues = async () =>
    page.locator('.settings-fields select, .settings-fields input').evaluateAll((elements) =>
      elements
        .filter(
          (element) => !element.closest('.scene-settings') && element.id !== 'setting-scenePreset',
        )
        .map((element) => ({
          id: element.id,
          value: (element as HTMLInputElement).value,
          checked: (element as HTMLInputElement).checked,
        })),
    );
  const originalVideoValues = await videoValues();
  const sceneSelect = page.getByLabel('沉浸場景', { exact: true });

  await sceneSelect.selectOption('aurora-fjord');
  await expect(page.getByLabel('極光流速', { exact: true })).toBeVisible();
  await page.getByLabel('極光流速', { exact: true }).fill('1.7');

  await sceneSelect.selectOption('nordic-cabin');
  await expect(page.getByLabel('飄雪速度', { exact: true })).toBeVisible();
  await expect(page.getByLabel('極光流速', { exact: true })).toBeHidden();

  await sceneSelect.selectOption('hallstatt');
  await expect(page.getByLabel('日夜場景', { exact: true })).toBeVisible();
  await expect(page.getByLabel('觀賞日期', { exact: true })).toHaveValue('2026-10-20');

  await sceneSelect.selectOption('kyoto');
  await expect(page.getByLabel('庭院雨勢', { exact: true })).toBeVisible();

  await sceneSelect.selectOption('forest');
  await expect(page.getByLabel('水流速度', { exact: true })).toBeVisible();

  await sceneSelect.selectOption('aurora-fjord');
  await expect(page.getByLabel('極光流速', { exact: true })).toHaveValue('1.7');
  expect(await videoValues()).toEqual(originalVideoValues);

  await page.getByRole('checkbox', { name: '飄雪', exact: true }).check();
  await page.getByLabel('霧氣 / 極光', { exact: true }).selectOption('aurora');
  await expect(page.getByLabel('極光流速', { exact: true })).toHaveValue('1.7');
  await expect(page.getByLabel('極光亮度', { exact: true })).toHaveValue('100');

  await page.getByLabel('光核模式', { exact: true }).selectOption({ label: '關閉' });
  await expect(page.getByLabel('光核模式', { exact: true })).toHaveValue('none');
  await page.setViewportSize({ width: 390, height: 844 });
  await sceneSelect.selectOption('nordic-cabin');
  await page.getByLabel('畫布比例', { exact: true }).selectOption('9:16');
  await page.locator('.settings-content').evaluate((panel) => {
    panel.scrollTop = 0;
  });
  await page.screenshot({ path: 'test-results/scene-settings-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('local media layers and long multilingual subtitles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openStudio(page);
  const fixture = await imageFixture(page);
  for (const label of ['匯入Logo', '匯入疊圖']) {
    await page.locator(`input[type=file][aria-label="${label}"]`).setInputFiles(fixture);
  }
  await expect(page.getByRole('button', { name: '清除Logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: '清除疊圖' })).toBeVisible();
  await page.getByLabel('色度去背', { exact: true }).check();
  await page.getByRole('button', { name: '清除Logo' }).click();
  await page.getByRole('button', { name: '清除疊圖' }).click();
  await page.locator('input[type=file][aria-label="匯入光核圖示"]').setInputFiles(fixture);
  await expect(page.getByRole('button', { name: '清除光核圖示' })).toBeVisible();
  await page.getByRole('button', { name: '清除光核圖示' }).click();
  expect(errors).toEqual([]);
});

test('text bitmap cache fits long multilingual subtitles', async ({ page }) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    'This engine harness imports Vite source modules.',
  );
  await page.goto('/');
  const width = await page.evaluate(async () => {
    const modulePath = '/src/engine/textBitmap.ts';
    const { createTextCache, TextBitmapCache } = await import(/* @vite-ignore */ modulePath);
    const cache = new TextBitmapCache();
    const create = createTextCache({ current: cache }, 'sans-serif', ['歌詞'], 900);
    const options = {
      id: 'long',
      text: '很長的歌詞'.repeat(20),
      subText: 'A long translation '.repeat(20),
      thirdText: '',
      mainFontSize: 72,
      subFontSize: 36,
      glow: 20,
      color: '#ffffff',
      centered: true,
      style: 'default',
    };
    const bitmap = create(options);
    for (let colorIndex = 0; colorIndex < 100; colorIndex++) {
      const changed = create({ ...options, color: `rgb(${colorIndex}, 120, 200)` });
      if (changed.canvas !== bitmap.canvas) throw new Error('Theme change allocated a new canvas');
    }
    if (cache.size !== 1) throw new Error('Theme changes duplicated the bitmap cache');
    return bitmap.canvas.width - bitmap.paddingX * 2;
  });
  expect(width).toBeLessThanOrEqual(901);
});

test('mobile controls fit and every visual option renders', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await openStudio(page);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await importAudio(page);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  for (const group of ['歌詞樣式', '光核與頻譜', '氛圍特效']) {
    const section = page.getByRole('region', { name: group, exact: true });
    for (const select of await section.locator('select').all()) {
      const values = await select
        .locator('option')
        .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
      for (const value of values) {
        await select.selectOption(value);
        await page.waitForTimeout(80);
      }
    }
    for (const checkbox of await section.locator('input[type=checkbox]').all())
      await checkbox.check();
    await page.waitForTimeout(150);
  }
  await page.getByLabel('畫布比例', { exact: true }).selectOption('9:16');
  await page.screenshot({ path: 'test-results/mobile-portrait.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('glass panels, hover visibility, effect shortcuts and no default background', async ({
  page,
}) => {
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') imageRequests.push(request.url());
  });
  await page.goto('/');
  const controls = page.locator('.workspace-controls');
  await expect(controls).toHaveCSS('opacity', '0');
  await expect(controls).toHaveCSS('visibility', 'hidden');
  expect(imageRequests).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(controls).toHaveCSS('opacity', '1');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '作品設定' })).toBeFocused();
  await page.getByLabel('歌曲名稱', { exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCSS('opacity', '0');
  await expect(controls).toHaveCSS('visibility', 'hidden');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await expect(controls).toHaveCSS('opacity', '1');
  await expect(page.getByText('0 個背景')).toBeVisible();
  const glass = await page.locator('.settings-panel').evaluate((panel) => {
    const style = getComputedStyle(panel);
    return { background: style.backgroundColor, blur: style.backdropFilter };
  });
  expect(glass.background).toBe('rgba(23, 23, 25, 0.91)');
  expect(glass.blur).toContain('blur(64px)');
  await page.getByRole('button', { name: '手動時間軸', exact: true }).click();
  await page.getByLabel('沉浸場景', { exact: true }).selectOption('kyoto');
  await expect(page.getByText('1 個背景')).toBeVisible();
  await expect
    .poll(() => imageRequests.some((url) => url.endsWith('/scenes/kyoto.jpg')))
    .toBe(true);
  await page.getByLabel('沉浸場景', { exact: true }).selectOption('none');
  await expect(page.getByText('0 個背景')).toBeVisible();
  const quickSnow = page
    .getByRole('group', { name: '環境特效快捷列' })
    .getByRole('button', { name: '飄雪', exact: true });
  await quickSnow.click();
  await expect(quickSnow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: '飄雪', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: '飄雪', exact: true }).uncheck();
  await expect(quickSnow).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('配色模式', { exact: true }).selectOption('random');
  await page.getByRole('button', { name: '主題色 #10b981', exact: true }).click();
  await expect(page.getByLabel('配色模式', { exact: true })).toHaveValue('fixed');
  await expect(page.getByLabel('主題色', { exact: true })).toHaveValue('#10b981');
  await page
    .locator('input[type=file][aria-label="匯入圖片／影片"]')
    .setInputFiles(await imageFixture(page));
  await expect(page.locator('.library-asset')).toHaveCount(1);
  await page.getByRole('button', { name: '關閉歌詞編輯', exact: true }).click();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.screenshot({ path: 'test-results/glass-controls.png' });
  await page.mouse.move(0, 0);
  await expect(controls).toHaveCSS('opacity', '0');
  await page.screenshot({ path: 'test-results/hidden-controls.png' });
});

test('lyrics editing toggles a 70/30 workspace with a working subtitle track', async ({ page }) => {
  await openStudio(page);
  await importAudio(page);
  const preview = page.locator('.preview-stage');
  const original = await preview.boundingBox();
  const canvas = await page.getByLabel('MV 即時預覽').elementHandle();
  const toggle = page.getByRole('button', { name: '歌詞編輯', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByRole('region', { name: '歌詞編輯', exact: true });
  const timeline = page.getByRole('region', { name: '影片時間軸' });
  await expect(panel).toBeVisible();
  await expect(timeline).toBeVisible();
  const left = (await preview.boundingBox())!;
  const right = (await panel.boundingBox())!;
  const bottom = (await timeline.boundingBox())!;
  expect(left.width / (left.width + right.width)).toBeCloseTo(0.7, 2);
  expect(Math.abs(left.y - right.y)).toBeLessThan(1);
  expect(bottom.y).toBeGreaterThanOrEqual(left.y + left.height);
  await page.locator('input[type=file][aria-label="匯入字幕"]').setInputFiles({
    name: 'lyrics.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from('[00:00.00] 第一句\n[00:02.00] 第二句'),
  });
  await page.getByRole('button', { name: /跳至字幕：第二句/ }).click();
  await expect(page.getByLabel('播放進度', { exact: true })).toHaveValue('2');
  await page.getByLabel('時間軸播放位置').fill('1');
  await expect(page.getByLabel('播放進度', { exact: true })).toHaveValue('1');
  await page.screenshot({ path: 'test-results/lyrics-workspace.png' });
  await preview.hover({ position: { x: 10, y: 10 } });
  await toggle.click();
  await expect(panel).toHaveCount(0);
  await expect(timeline).toHaveCount(0);
  expect((await preview.boundingBox())!.width).toBeCloseTo(original!.width, 0);
  expect(
    await canvas!.evaluate(
      (element) => element === document.querySelector('.preview-stage > canvas'),
    ),
  ).toBe(true);
  await toggle.click();
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await expect(page.getByLabel('字幕 2 文字')).toHaveValue('第二句');
  await page.getByRole('button', { name: '開始對時', exact: true }).click();
  await expect(page.getByRole('region', { name: '歌詞對時', exact: true })).toBeVisible();
  await toggle.click();
  await expect(page.locator('.studio')).not.toHaveClass(/lyrics-editing/);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.click();
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('captions edit, search, split, drag, trim, lock and export in the shared workspace', async ({
  page,
}) => {
  await openStudio(page);
  await importAudio(page);
  await page.locator('input[type=file][aria-label="匯入字幕"]').setInputFiles({
    name: 'captions.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:06,000 --> 00:00:09,000\nWorld',
    ),
  });
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('Hello');
  await page.getByLabel('字幕 1 文字').fill('Hello edited');
  await page.getByLabel('字幕 1 文字').press('Tab');
  await page.getByLabel('搜尋字幕').fill('edited');
  await page.getByLabel('取代文字').fill('字幕');
  await page.getByRole('button', { name: '全部取代' }).click();
  await expect(page.locator('.caption-search').getByRole('status')).toHaveText('已取代 1 處文字');
  await page.getByLabel('搜尋字幕').fill('');
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('Hello 字幕');
  await page.getByRole('button', { name: '選取字幕 1', exact: true }).click();
  await page.getByLabel('時間軸播放位置').fill('2');
  await page.getByRole('button', { name: '分割字幕', exact: true }).click();
  await expect(page.locator('.caption-row')).toHaveCount(3);
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(page.locator('.caption-row')).toHaveCount(2);
  await page.getByRole('button', { name: '吸附', exact: true }).click();
  const clip = page.locator('.subtitle-clip').first();
  const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await clip.boundingBox())!.x).toBeGreaterThan(box.x + 40);
  await page.getByRole('button', { name: '復原', exact: true }).click();
  expect((await clip.boundingBox())!.x).toBeCloseTo(box.x, 0);
  const handle = (await clip.locator('.subtitle-trim.end').boundingBox())!;
  await page.mouse.move(handle.x + 3, handle.y + 20);
  await page.mouse.down();
  await page.mouse.move(handle.x + 43, handle.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await clip.boundingBox())!.width).toBeGreaterThan(box.width + 25);
  await page.getByRole('button', { name: '鎖定字幕軌道', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toBeDisabled();
  await expect(page.getByRole('button', { name: '刪除字幕', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '解鎖字幕軌道', exact: true }).click();
  await page.getByLabel('時間軸縮放').fill('4');
  expect(
    await page
      .locator('.subtitle-scroll')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await page.getByRole('button', { name: '適合', exact: true }).click();
  await expect(page.locator('.caption-row input[type=number]')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SRT', exact: true }).click();
  const download = await pending;
  const exported = await fs.readFile((await download.path())!, 'utf8');
  expect(exported).toContain('00:00:01,000 -->');
  expect(exported).toContain('Hello 字幕');
  await page.screenshot({ path: 'test-results/captions-editor.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('字幕 1 文字')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.lyrics-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/captions-editor-mobile.png', fullPage: true });
});

test('lyrics and timeline panels resize, reset and retain sizes across layout toggles', async ({
  page,
}) => {
  await openStudio(page);
  const toggle = page.getByRole('button', { name: '歌詞編輯', exact: true });
  await toggle.click();
  const panel = page.locator('.lyrics-panel');
  const timeline = page.locator('.subtitle-timeline');
  const initialWidth = (await panel.boundingBox())!.width;
  const initialHeight = (await timeline.boundingBox())!.height;
  const widthHandle = page.getByRole('separator', { name: '調整歌詞編輯寬度' });
  const position = (await widthHandle.boundingBox())!;
  await page.mouse.move(position.x + 6, position.y + position.height / 2);
  await page.mouse.down();
  await page.mouse.move(position.x - 100, position.y + position.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await panel.boundingBox())!.width).toBeGreaterThan(initialWidth + 80);
  const heightHandle = page.getByRole('separator', { name: '調整時間軸高度' });
  const bottom = (await heightHandle.boundingBox())!;
  await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + 6);
  await page.mouse.down();
  await page.mouse.move(bottom.x + bottom.width / 2, bottom.y - 90, { steps: 5 });
  await page.mouse.up();
  expect((await timeline.boundingBox())!.height).toBeGreaterThan(initialHeight + 80);
  const resizedWidth = (await panel.boundingBox())!.width;
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await toggle.click();
  await expect(widthHandle).toHaveCount(0);
  await toggle.click();
  expect((await panel.boundingBox())!.width).toBeCloseTo(resizedWidth, 0);
  await widthHandle.dblclick();
  expect((await panel.boundingBox())!.width).toBeCloseTo(initialWidth, 0);
  await heightHandle.focus();
  await page.keyboard.press('Home');
  expect((await timeline.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
  await page.keyboard.press('ArrowUp');
  expect((await timeline.boundingBox())!.height).toBeCloseTo(initialHeight + 10, 0);
  await page.screenshot({ path: 'test-results/resizable-panels.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHandle = page.getByRole('separator', { name: '調整歌詞編輯高度' });
  await mobileHandle.focus();
  await page.keyboard.press('ArrowUp');
  expect((await panel.boundingBox())!.height).toBeCloseTo(490, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('multiple visuals and audio assets share one sequence and one subtitle document', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openStudio(page);
  const picture = await imageFixture(page);
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#287fa7';
    context.fillRect(0, 0, 320, 180);
    const audio = new AudioContext();
    await audio.resume();
    const destination = audio.createMediaStreamDestination();
    const oscillator = audio.createOscillator();
    oscillator.frequency.value = 880;
    oscillator.connect(destination);
    oscillator.start();
    const stream = canvas.captureStream(15);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    recorder.stop();
    await done;
    oscillator.stop();
    stream.getTracks().forEach((track) => track.stop());
    await audio.close();
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.locator('input[type=file][aria-label="匯入圖片／影片"]').setInputFiles([
    { ...picture, name: 'image-one.png' },
    { name: 'video-one.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) },
    { ...picture, name: 'image-two.png' },
    { name: 'video-two.webm', mimeType: 'video/webm', buffer: Buffer.from(videoBytes) },
  ]);
  await expect(page.locator('.library-asset')).toHaveCount(4);
  await page.locator('input[type=file][aria-label="加入音訊素材"]').setInputFiles([
    { ...audioFixture(220), name: 'voice-one.wav' },
    { ...audioFixture(440), name: 'voice-two.wav' },
  ]);
  await expect(page.locator('.library-asset')).toHaveCount(6);
  await expect(page.locator('.media-clip')).toHaveCount(1);
  for (const name of [
    'image-one.png',
    'video-one.webm',
    'image-two.png',
    'video-two.webm',
    'voice-two.wav',
  ]) {
    await page.getByRole('button', { name: `加入時間軸：${name}`, exact: true }).click();
  }
  await expect(page.locator('.media-clip')).toHaveCount(6);
  async function trim(name: string, start: number, duration: number) {
    await page.getByRole('button', { name: `選取影音片段：${name}`, exact: true }).click();
    await page.getByLabel('影音片段長度', { exact: true }).fill(String(duration));
    await page.getByLabel('影音片段長度', { exact: true }).press('Tab');
    await page.getByLabel('影音片段開始', { exact: true }).fill(String(start));
    await page.getByLabel('影音片段開始', { exact: true }).press('Tab');
  }
  await trim('image-one.png', 0, 0.5);
  await trim('video-one.webm', 0.5, 0.5);
  await trim('image-two.png', 1, 0.5);
  await trim('video-two.webm', 1.5, 0.5);
  await trim('voice-one.wav', 0, 1);
  await trim('voice-two.wav', 1, 1);
  await expect(page.getByLabel('播放進度', { exact: true })).toHaveAttribute('max', '2');
  await page.getByRole('button', { name: '加入第二音軌：voice-one.wav', exact: true }).click();
  await expect(page.getByRole('group', { name: 'A2 音訊軌道', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刪除影音片段', exact: true }).click();
  await expect(page.locator('.library-asset')).toHaveCount(6);
  const srt = (text: string) => ({
    name: `${text}.srt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`1\n00:00:00,000 --> 00:00:01,000\n${text}`),
  });
  await page.locator('input[type=file][aria-label="替換字幕檔"]').setInputFiles(srt('First'));
  await expect(page.locator('.caption-row')).toHaveCount(1);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.locator('input[type=file][aria-label="替換字幕檔"]').setInputFiles(srt('Second'));
  await expect(page.locator('.caption-row')).toHaveCount(1);
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('Second');
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: '選取影音片段：video-one.webm', exact: true }).click();
  await expect(page.getByLabel('啟用影片原音')).not.toBeChecked();
  await page.getByLabel('啟用影片原音').check();
  await expect(page.getByLabel('啟用影片原音')).toBeChecked();
  await page.getByLabel('啟用影片原音').uncheck();
  await page.getByLabel('時間軸播放位置').fill('1.7');
  await page.screenshot({ path: 'test-results/multi-media-sequence.png' });
  await page.getByRole('button', { name: '關閉歌詞編輯', exact: true }).click();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '開始錄影', exact: true }).click();
  const download = await pending;
  const bytes = await fs.readFile((await download.path())!);
  const audio = await page.evaluate(
    async (data) => {
      const context = new OfflineAudioContext(1, 1, 48000);
      const buffer = await context.decodeAudioData(new Uint8Array(data).buffer);
      const samples = buffer.getChannelData(0);
      const measure = (start: number) => {
        const from = Math.round(start * buffer.sampleRate);
        const count = Math.round(0.3 * buffer.sampleRate);
        let power = 0,
          crossings = 0;
        for (let index = from; index < Math.min(samples.length - 1, from + count); index++) {
          power += samples[index] ** 2;
          if (samples[index] < 0 && samples[index + 1] >= 0) crossings++;
        }
        return { rms: Math.sqrt(power / count), crossings };
      };
      return { duration: buffer.duration, first: measure(0.3), second: measure(1.3) };
    },
    [...bytes],
  );
  expect(audio.duration).toBeGreaterThan(1.8);
  expect(audio.duration).toBeLessThan(3);
  expect(audio.first.rms).toBeGreaterThan(0.03);
  expect(audio.second.rms).toBeGreaterThan(0.03);
  expect(audio.second.crossings).toBeGreaterThan(audio.first.crossings * 1.5);
  await page.getByRole('button', { name: '自動編排圖片', exact: true }).click();
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  const visualTrack = page.getByRole('group', { name: 'V1 畫面軌道', exact: true });
  await expect(visualTrack).toHaveAttribute('aria-disabled', 'true');
  await expect(visualTrack.locator('.media-clip')).toHaveCount(0);
  await expect(page.locator('.media-clip.audio')).toHaveCount(2);
  await expect(page.locator('.library-asset')).toHaveCount(6);
  await expect(page.getByText('2 個背景', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '加入時間軸：video-one.webm', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '加入時間軸：image-one.png', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '加入時間軸：voice-one.wav', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('影片速度', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '復原影音', exact: true }).click();
  await expect(visualTrack.locator('.media-clip')).toHaveCount(0);
  await page.getByRole('button', { name: '重做影音', exact: true }).click();
  await expect(visualTrack.locator('.media-clip')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/automatic-images-locked-track.png' });
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('Second');
  await page.getByRole('button', { name: '手動時間軸', exact: true }).click();
  await expect(visualTrack).toHaveAttribute('aria-disabled', 'false');
  await expect(visualTrack.locator('.media-clip')).toHaveCount(0);
  await page.getByRole('button', { name: '素材', exact: true }).click();
  await page.getByRole('button', { name: '加入時間軸：video-one.webm', exact: true }).click();
  await expect(visualTrack.locator('.media-clip')).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('first imported audio becomes active without opening the editor; later files stay in the library', async ({
  page,
}) => {
  await openStudio(page);
  await page.locator('input[type=file][aria-label="匯入音訊"]').setInputFiles([
    { ...audioFixture(), name: 'first.wav' },
    { ...audioFixture(440), name: 'second.wav' },
  ]);
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
  await expect(page.locator('.studio')).not.toHaveClass(/lyrics-editing/);
  await expect(page.locator('.media-status')).toContainText('2 個素材 · 1 個片段');
  await expect(page.getByLabel('播放進度', { exact: true })).toHaveAttribute('max', '18');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByLabel('播放進度', { exact: true }).inputValue()))
    .toBeGreaterThan(0.1);
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page
    .locator('input[type=file][aria-label="匯入音訊"]')
    .setInputFiles({ ...audioFixture(), name: 'third.wav' });
  await expect(page.locator('.library-asset')).toHaveCount(3);
  await expect(page.locator('.media-clip')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: '選取影音片段：first.wav', exact: true }),
  ).toBeVisible();
});

test('caption rows replace the raw editor and accept pasted lyrics without showing timing', async ({
  page,
}) => {
  await openStudio(page);
  await importAudio(page);
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await page.getByRole('button', { name: '逐句字幕', exact: true }).click();
  await expect(page.getByRole('button', { name: '原始歌詞', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '新增字幕', exact: true }).click();
  await page.getByLabel('字幕 1 文字').evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    input.focus();
    input.select();
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', '第一句歌詞\n第二句歌詞\n第三句歌詞');
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('.caption-row')).toHaveCount(3);
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('第一句歌詞');
  await expect(page.getByLabel('字幕 2 文字')).toHaveValue('第二句歌詞');
  await expect(page.locator('.caption-times')).toHaveCount(0);
  await expect(page.locator('.caption-jump').first()).toHaveText('1');
  const number = (await page.locator('.caption-jump').first().boundingBox())!;
  const lyric = (await page.getByLabel('字幕 1 文字').boundingBox())!;
  expect(Math.abs(number.y - lyric.y)).toBeLessThan(2);
  expect(lyric.x).toBeGreaterThan(number.x);
  await page.getByLabel('搜尋字幕').fill('第二');
  await expect(page.locator('.caption-jump')).toHaveText('2');
  await page.getByLabel('搜尋字幕').fill('');
  await page.screenshot({ path: 'test-results/clean-caption-list.png' });
  await page.getByRole('button', { name: '開始對時', exact: true }).click();
  await page.getByRole('button', { name: '標記目前歌詞', exact: true }).click();
  await page.getByRole('button', { name: '完成對時', exact: true }).click();
  await expect(page.getByLabel('字幕 1 文字')).toHaveValue('第一句歌詞');
  await expect(page.locator('.caption-row')).toHaveCount(3);
  await expect(page.getByLabel('字幕 3 文字')).toHaveValue('第三句歌詞');
});

test('automatic images cycle on their own clock without playing or seeking the timeline', async ({
  page,
}) => {
  await openStudio(page, 'auto');
  await expect(page.getByRole('button', { name: '自動編排圖片', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('輪播間隔 (秒)', { exact: true }).fill('3');
  for (const name of ['懷舊濾鏡', '散景', '暗角'])
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  const pictures = await page.evaluate(() =>
    ['#ff0000', '#0000ff', '#00ff00'].map((color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(0, 0, 640, 360);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
  );
  await page.locator('input[aria-label="匯入圖片／影片"]').setInputFiles(
    pictures.map((buffer, index) => ({
      name: `image-${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(buffer, 'base64'),
    })),
  );
  await expect(page.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  await expect(page.locator('.media-clip')).toHaveCount(0);
  await expect(page.getByLabel('時間軸播放位置')).toHaveValue('0');
  const observations = await page.getByLabel('MV 即時預覽').evaluate(async (element) => {
    const canvas = element as HTMLCanvasElement;
    return new Promise<{ colors: string[]; playheads: string[] }>((resolve) => {
      const colors: string[] = [];
      const playheads = new Set<string>();
      const sample = setInterval(() => {
        const pixel = canvas
          .getContext('2d')!
          .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
        const value =
          pixel[0] > 150 && pixel[2] < 50 && pixel[1] < 50
            ? 'red'
            : pixel[2] > 150 && pixel[0] < 50 && pixel[1] < 50
              ? 'blue'
              : pixel[1] > 150 && pixel[0] < 50 && pixel[2] < 50
                ? 'green'
                : null;
        if (value && colors[colors.length - 1] !== value) colors.push(value);
        playheads.add(
          document.querySelector<HTMLInputElement>('[aria-label="時間軸播放位置"]')!.value,
        );
        if (colors.length === 4) finish();
      }, 100);
      const deadline = setTimeout(finish, 15000);
      function finish() {
        clearInterval(sample);
        clearTimeout(deadline);
        resolve({ colors, playheads: [...playheads] });
      }
    });
  });
  expect(new Set(observations.colors).size).toBe(3);
  expect(observations.colors).toHaveLength(4);
  expect(observations.colors[0]).toBe(observations.colors[3]);
  expect(observations.playheads).toEqual(['0']);
  await page.locator('input[aria-label="加入音訊素材"]').setInputFiles(audioFixture());
  await expect(page.getByLabel('時間軸播放位置')).toHaveAttribute('max', '18');
  await page.getByRole('button', { name: '手動時間軸', exact: true }).click();
  await page.getByRole('button', { name: '自動編排圖片', exact: true }).click();
  await page.getByLabel('輪播間隔 (秒)', { exact: true }).fill('30');
  const color = () =>
    page.getByLabel('MV 即時預覽').evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixel = canvas
        .getContext('2d')!
        .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
      return pixel[0] > pixel[1] && pixel[0] > pixel[2] ? 'red' : 'other';
    });
  await expect.poll(color).toBe('red');
  await page.getByLabel('時間軸播放位置').fill('10');
  await expect.poll(color).toBe('red');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '暫停', exact: true }).click();
  await page.getByLabel('時間軸播放位置').fill('0');
  await expect.poll(color).toBe('red');
  await expect(page.getByLabel('時間軸播放位置')).toHaveAttribute('max', '18');
  await page.locator('.visual-arrangement').scrollIntoViewIfNeeded();
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.screenshot({ path: 'test-results/independent-slideshow.png' });
});
