import { expect, test, type Page } from '@playwright/test';

async function openTimeline(page: Page) {
  await page.goto('/');
  await page.locator('.preview-stage').hover({ position: { x: 10, y: 10 } });
  await page.getByLabel('匯入字幕', { exact: true }).setInputFiles({
    name: 'selection.srt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      '1\n00:00:01,000 --> 00:00:03,000\nOne\n\n2\n00:00:05,000 --> 00:00:07,000\nTwo\n\n3\n00:00:09,000 --> 00:00:11,000\nThree',
    ),
  });
  await page.getByRole('button', { name: '歌詞編輯', exact: true }).click();
  await expect(page.locator('.subtitle-clip')).toHaveCount(3);
  await page.locator('.subtitle-track').scrollIntoViewIfNeeded();
}
async function box(page: Page, start: number, end: number, release = true) {
  const track = (await page.locator('.subtitle-track').boundingBox())!;
  await page.mouse.move(track.x + track.width * start, track.y + 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * end, track.y + 51, { steps: 8 });
  if (release) await page.mouse.up();
}

test('marquee selects a group, moves it together and supports batch deletion and undo', async ({
  page,
}) => {
  await openTimeline(page);
  await box(page, 0.04, 0.68);
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
  await expect(page.locator('.subtitle-marquee')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '分割字幕', exact: true })).toBeDisabled();
  const clips = page.locator('.subtitle-clip');
  const before = await clips.evaluateAll((elements) =>
    elements.map((element) => parseFloat((element as HTMLElement).style.left)),
  );
  await page.getByRole('button', { name: '吸附', exact: true }).click();
  const first = (await clips.first().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + 22);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 24, first.y + 22, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
  const after = await clips.evaluateAll((elements) =>
    elements.map((element) => parseFloat((element as HTMLElement).style.left)),
  );
  expect(after[0] - before[0]).toBeCloseTo(24, 0);
  expect(after[1] - before[1]).toBeCloseTo(24, 0);
  expect(after[2]).toBe(before[2]);
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await page.getByRole('button', { name: '刪除字幕', exact: true }).click();
  await expect(clips).toHaveCount(1);
  await expect(clips).toHaveText('Three');
  await page.getByRole('button', { name: '復原', exact: true }).click();
  await expect(clips).toHaveCount(3);
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
});

test('reverse marquee, Escape, blank clicks and track locking preserve selection semantics', async ({
  page,
}) => {
  await openTimeline(page);
  await box(page, 0.96, 0.4);
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
  await box(page, 0.03, 0.99, false);
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
  await expect(page.locator('.subtitle-marquee')).toHaveCount(0);
  await page.locator('.subtitle-track').click({ position: { x: 3, y: 2 } });
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(0);
  await page.getByRole('button', { name: '鎖定字幕軌道', exact: true }).click();
  await box(page, 0.03, 0.99);
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(0);
});

test('marquee follows horizontal scroll when zoomed', async ({ page }) => {
  await openTimeline(page);
  await page.getByLabel('時間軸縮放', { exact: true }).fill('4');
  await page.locator('.subtitle-scroll').evaluate((element) => {
    element.scrollLeft = element.clientWidth;
  });
  const track = (await page.locator('.subtitle-track').boundingBox())!;
  const container = (await page.locator('.subtitle-scroll').boundingBox())!;
  await page.mouse.move(container.x + 25, track.y + 2);
  await page.mouse.down();
  await page.mouse.move(container.x + container.width - 40, track.y + 51, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.subtitle-clip.selected')).toHaveCount(2);
  await expect(page.locator('.subtitle-clip.selected').first()).toHaveText('One');
  await expect(page.locator('.subtitle-clip.selected').last()).toHaveText('Two');
});
