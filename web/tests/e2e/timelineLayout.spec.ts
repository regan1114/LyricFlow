import { expect, test } from '@playwright/test';

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
  return { name: 'end-of-song.wav', mimeType: 'audio/wav', buffer };
}

for (const classicScrollbars of [false, true]) {
  test(`song ending keeps timeline geometry stable (${classicScrollbars ? 'classic' : 'default'} scrollbars)`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    if (classicScrollbars) {
      // Reproduce systems configured to reserve layout space for scrollbars.
      await page.addStyleTag({ content: '::-webkit-scrollbar { width: 15px; height: 15px; }' });
    }
    await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
    await page.getByLabel('匯入音訊', { exact: true }).setInputFiles(audioFixture());
    await expect(page.getByRole('button', { name: '播放', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
    const slider = page.getByLabel('時間軸播放位置', { exact: true });
    await slider.evaluate((element) => {
      (element as HTMLInputElement).value = '3.7';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(slider).toHaveValue('3.7');
    const baseline = await page.locator('.subtitle-scroll').evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
    }));
    await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
    await page.getByRole('button', { name: '播放', exact: true }).click();
    const frames = await page.locator('.subtitle-scroll').evaluate(async (element) => {
      const samples: { width: number; height: number; overflow: number; top: number }[] = [];
      await new Promise<void>((resolve) => {
        function sample() {
          samples.push({
            width: element.clientWidth,
            height: element.clientHeight,
            overflow: element.scrollWidth - element.clientWidth,
            top: element.scrollTop,
          });
          if (samples.length >= 60) resolve();
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      return samples;
    });
    await expect(slider).toHaveValue('4');
    expect(Math.max(...frames.map((frame) => frame.overflow))).toBe(0);
    expect([...new Set(frames.map((frame) => frame.width))]).toEqual([baseline.width]);
    expect([...new Set(frames.map((frame) => frame.height))]).toEqual([baseline.height]);
    expect([...new Set(frames.map((frame) => frame.top))]).toHaveLength(1);
    const playheads = await page.locator('.subtitle-playhead').evaluateAll((elements) =>
      elements.map((element) => {
        const head = element.getBoundingClientRect(),
          track = element.parentElement!.getBoundingClientRect();
        return { left: head.left - track.left, right: track.right - head.right };
      }),
    );
    expect(
      playheads.every((head) => head.left >= 0 && head.right >= -0.1 && head.right <= 1.1),
    ).toBe(true);
    // Zooming must still provide a horizontal scrollbar and keep the endpoint reachable.
    await page.getByLabel('時間軸縮放', { exact: true }).evaluate((element) => {
      (element as HTMLInputElement).value = '4';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect
      .poll(() =>
        page
          .locator('.subtitle-scroll')
          .evaluate((element) => element.scrollWidth / element.clientWidth),
      )
      .toBeCloseTo(4, 1);
    await page.locator('.subtitle-scroll').evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const endpoint = await page.locator('.subtitle-scroll').evaluate((element) => {
      const head = element
        .querySelector('.media-track-clips .subtitle-playhead')!
        .getBoundingClientRect();
      const viewport = element.getBoundingClientRect();
      return head.left >= viewport.left && head.right <= viewport.left + element.clientWidth + 0.1;
    });
    expect(endpoint).toBe(true);
    expect(errors).toEqual([]);
  });
}
